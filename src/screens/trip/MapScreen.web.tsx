import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { Header, LoadingScreen, Button, Input, TimePickerInput, PlaceAutocomplete, CategoryFieldsInput } from '../../components/common';
import { PlaceResult, importMapsLibrary } from '../../components/common/PlaceAutocomplete';
import { getStops } from '../../api/stops';
import { getActivitiesForTrip, getDays, createActivity } from '../../api/itineraries';
import { getTrip } from '../../api/trips';
import { TripStop, Activity, ItineraryDay } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { ACTIVITY_CATEGORIES } from '../../utils/constants';
import { CATEGORY_COLORS, formatCategoryDetail } from '../../utils/categoryFields';
import { formatDateShort } from '../../utils/dateHelpers';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';

const API_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  || '';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

const getCategoryIcon = (cat: string) => ACTIVITY_CATEGORIES.find(c => c.id === cat)?.icon || '📌';

function buildInfoContent(act: Activity): string {
  const icon = getCategoryIcon(act.category);
  const catData = act.category_data || {};
  const detail = formatCategoryDetail(act.category, catData);
  let html = `<div style="font-family:sans-serif;min-width:180px"><strong>${icon} ${act.title}</strong>`;
  if (act.location_name) html += `<br/><small>📍 ${act.location_name}</small>`;
  if (detail) html += `<br/><span style="color:${CATEGORY_COLORS[act.category] || '#666'};font-size:13px">${detail}</span>`;
  if (act.description) html += `<br/><small style="color:#636E72">${act.description}</small>`;
  html += '</div>';
  return html;
}


export const MapScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const mapRef = useRef<HTMLDivElement | null>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<ItineraryDay[]>([]);

  // FAB modal state
  const [showModal, setShowModal] = useState(false);
  const [selectedDayId, setSelectedDayId] = useState<string>('');
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('activity');
  const [newStartTime, setNewStartTime] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newLocationLat, setNewLocationLat] = useState<number | null>(null);
  const [newLocationLng, setNewLocationLng] = useState<number | null>(null);
  const [newLocationAddress, setNewLocationAddress] = useState<string | null>(null);
  const [newNotes, setNewNotes] = useState('');
  const [newCategoryData, setNewCategoryData] = useState<Record<string, any>>({});

  const initMap = useCallback(async () => {
    try {
      const [t, s, a, fetchedDays] = await Promise.all([
        getTrip(tripId),
        getStops(tripId),
        getActivitiesForTrip(tripId),
        getDays(tripId),
      ]);

      setDays(fetchedDays);
      if (fetchedDays.length > 0 && !selectedDayId) {
        setSelectedDayId(fetchedDays[0].id);
      }

      const mapsLib = await importMapsLibrary('maps');
      const markerLib = await importMapsLibrary('marker');
      await importMapsLibrary('routes');
      await importMapsLibrary('core');
      if (!mapRef.current) return;

      const center = s.length > 0
        ? { lat: s[0].lat, lng: s[0].lng }
        : t.destination_lat && t.destination_lng
          ? { lat: t.destination_lat, lng: t.destination_lng }
          : { lat: 47.37, lng: 8.54 };

      const MapClass = mapsLib.Map || google.maps.Map;
      const map = new MapClass(mapRef.current, {
        center,
        zoom: 8,
        mapTypeControl: false,
        streetViewControl: false,
        mapId: 'vacation-planner-map',
      });
      googleMapRef.current = map;

      const { AdvancedMarkerElement, PinElement } = markerLib;
      const bounds = new google.maps.LatLngBounds();
      let openInfoWindow: google.maps.InfoWindow | null = null;

      const openInfo = (infoWindow: google.maps.InfoWindow, anchor: any) => {
        if (openInfoWindow) openInfoWindow.close();
        infoWindow.open({ map, anchor });
        openInfoWindow = infoWindow;
      };

      // Stop markers
      s.forEach((stop: TripStop, i: number) => {
        const pos = { lat: stop.lat, lng: stop.lng };
        bounds.extend(pos);
        const pin = new PinElement({
          background: stop.type === 'overnight' ? colors.primary : colors.secondary,
          borderColor: '#FFFFFF',
          glyph: `${i + 1}`,
          glyphColor: '#FFFFFF',
        });
        const marker = new AdvancedMarkerElement({
          position: pos, map, title: stop.name,
          content: pin,
        });
        const infoWindow = new google.maps.InfoWindow({
          content: `<div style="font-family:sans-serif"><strong>${stop.name}</strong><br/>${stop.type === 'overnight' ? `🏠 ${stop.arrival_date && stop.departure_date ? `${stop.arrival_date} – ${stop.departure_date} (${stop.nights} N.)` : `${stop.nights} Nacht/Nächte`}` : '📍 Zwischenstopp'}<br/><small>${stop.address || ''}</small></div>`,
        });
        marker.addEventListener('gmp-click', () => openInfo(infoWindow, marker));
      });

      // Activity markers
      a.filter((act: Activity) => act.location_lat && act.location_lng).forEach((act: Activity) => {
        const pos = { lat: act.location_lat!, lng: act.location_lng! };
        bounds.extend(pos);
        const catColor = CATEGORY_COLORS[act.category] || colors.accent;
        const glyphEl = document.createElement('span');
        glyphEl.textContent = getCategoryIcon(act.category);
        glyphEl.style.fontSize = '14px';
        const pin = new PinElement({
          background: catColor,
          borderColor: '#FFFFFF',
          glyph: glyphEl,
        });
        const marker = new AdvancedMarkerElement({
          position: pos, map, title: act.title,
          content: pin,
        });
        const infoWindow = new google.maps.InfoWindow({ content: buildInfoContent(act) });
        marker.addEventListener('gmp-click', () => openInfo(infoWindow, marker));
      });

      // Transport routes
      a.filter((act: Activity) => act.category === 'transport').forEach((act: Activity) => {
        const catData = act.category_data || {};
        const depLat = catData.departure_station_lat;
        const depLng = catData.departure_station_lng;
        const arrLat = catData.arrival_station_lat;
        const arrLng = catData.arrival_station_lng;

        if (depLat && depLng && arrLat && arrLng) {
          const depPos = { lat: depLat, lng: depLng };
          const arrPos = { lat: arrLat, lng: arrLng };
          bounds.extend(depPos);
          bounds.extend(arrPos);

          const depGlyph = document.createElement('span');
          depGlyph.textContent = '🛫';
          depGlyph.style.fontSize = '14px';
          const depPin = new PinElement({
            background: CATEGORY_COLORS.transport, borderColor: '#FFFFFF', glyph: depGlyph,
          });
          const depMarker = new AdvancedMarkerElement({
            position: depPos, map, title: catData.departure_station_name || 'Abfahrt',
            content: depPin,
          });
          const depInfo = new google.maps.InfoWindow({ content: buildInfoContent(act) });
          depMarker.addEventListener('gmp-click', () => openInfo(depInfo, depMarker));

          const arrGlyph = document.createElement('span');
          arrGlyph.textContent = '🛬';
          arrGlyph.style.fontSize = '14px';
          const arrPin = new PinElement({
            background: CATEGORY_COLORS.transport, borderColor: '#FFFFFF', glyph: arrGlyph,
          });
          const arrMarker = new AdvancedMarkerElement({
            position: arrPos, map, title: catData.arrival_station_name || 'Ankunft',
            content: arrPin,
          });
          const arrInfo = new google.maps.InfoWindow({ content: buildInfoContent(act) });
          arrMarker.addEventListener('gmp-click', () => openInfo(arrInfo, arrMarker));

          new google.maps.Polyline({
            path: [depPos, arrPos],
            map,
            strokeColor: CATEGORY_COLORS.transport,
            strokeWeight: 3,
            strokeOpacity: 0,
            icons: [{
              icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, scale: 3, strokeColor: CATEGORY_COLORS.transport },
              offset: '0',
              repeat: '15px',
            }],
          });
        }
      });

      // Route via Directions
      if (s.length >= 2) {
        const directionsService = new google.maps.DirectionsService();
        const waypoints = s.slice(1, -1).map((st: TripStop) => ({
          location: new google.maps.LatLng(st.lat, st.lng),
          stopover: true,
        }));
        directionsService.route({
          origin: new google.maps.LatLng(s[0].lat, s[0].lng),
          destination: new google.maps.LatLng(s[s.length - 1].lat, s[s.length - 1].lng),
          waypoints,
          travelMode: google.maps.TravelMode.DRIVING,
        }, (result, status) => {
          if (status === 'OK' && result) {
            new google.maps.DirectionsRenderer({
              map,
              directions: result,
              suppressMarkers: true,
              polylineOptions: {
                strokeColor: colors.primary,
                strokeWeight: 4,
                strokeOpacity: 0.7,
              },
            });
          }
        });
      }

      const hasPoints = s.length > 0 || a.some((act: Activity) => act.location_lat);
      if (hasPoints) map.fitBounds(bounds, 60);
    } catch (e) {
      console.error('Map init error:', e);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { initMap(); }, [initMap]);

  const handleAddActivity = async () => {
    if (!newTitle.trim() || !selectedDayId) return;
    try {
      await createActivity({
        day_id: selectedDayId,
        trip_id: tripId,
        title: newTitle.trim(),
        description: newNotes.trim() || null,
        category: newCategory,
        start_time: newStartTime || null,
        end_time: null,
        location_name: newLocation.trim() || null,
        location_lat: newLocationLat,
        location_lng: newLocationLng,
        location_address: newLocationAddress,
        cost: null,
        currency: 'CHF',
        sort_order: 0,
        check_in_date: newCategoryData.check_in_date || null,
        check_out_date: newCategoryData.check_out_date || null,
        category_data: newCategoryData,
      });
      setShowModal(false);
      resetForm();
      // Reinitialize map to show new marker
      setLoading(true);
      await initMap();
    } catch (e) {
      Alert.alert('Fehler', 'Aktivität konnte nicht erstellt werden');
    }
  };

  const resetForm = () => {
    setNewTitle('');
    setNewNotes('');
    setNewLocation('');
    setNewLocationLat(null);
    setNewLocationLng(null);
    setNewLocationAddress(null);
    setNewStartTime('');
    setNewCategory('activity');
    setNewCategoryData({});
  };

  return (
    <View style={styles.container}>
      <Header title="Karte" onBack={() => navigation.goBack()} />
      {loading && <LoadingScreen />}
      <div ref={mapRef} style={{ flex: 1, width: '100%', height: '100%', display: loading ? 'none' : 'block' }} />

      {/* FAB */}
      {!loading && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Add Activity Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Aktivität hinzufügen</Text>
            <ScrollView>
              {/* Day Picker */}
              <Text style={styles.fieldLabel}>Tag</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                {days.map(day => (
                  <TouchableOpacity
                    key={day.id}
                    style={[styles.catChip, selectedDayId === day.id && styles.catChipActive]}
                    onPress={() => setSelectedDayId(day.id)}
                  >
                    <Text style={[styles.catLabel, selectedDayId === day.id && styles.catLabelActive]}>
                      {formatDateShort(day.date)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Input label="Titel" placeholder="z.B. Stadtführung" value={newTitle} onChangeText={setNewTitle} />

              <Text style={styles.fieldLabel}>Kategorie</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                {ACTIVITY_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.catChip, newCategory === cat.id && styles.catChipActive]}
                    onPress={() => { setNewCategory(cat.id); setNewCategoryData({}); }}
                  >
                    <Text style={styles.catIcon}>{cat.icon}</Text>
                    <Text style={[styles.catLabel, newCategory === cat.id && styles.catLabelActive]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TimePickerInput label="Uhrzeit" value={newStartTime} onChange={setNewStartTime} placeholder="z.B. 09:00" />

              <CategoryFieldsInput category={newCategory} data={newCategoryData} onChange={setNewCategoryData} />

              <PlaceAutocomplete
                label="Ort"
                placeholder="z.B. Sagrada Familia"
                value={newLocation}
                onChangeText={setNewLocation}
                onSelect={(place: PlaceResult) => {
                  setNewLocation(place.name);
                  setNewLocationLat(place.lat);
                  setNewLocationLng(place.lng);
                  setNewLocationAddress(place.address);
                }}
              />

              <Input label="Notizen" placeholder="Optionale Notizen..." value={newNotes} onChangeText={setNewNotes} multiline numberOfLines={3} style={{ height: 80, textAlignVertical: 'top' }} />
            </ScrollView>

            <View style={styles.modalButtons}>
              <Button title="Abbrechen" onPress={() => { setShowModal(false); resetForm(); }} variant="ghost" style={styles.modalBtn} />
              <Button title="Hinzufügen" onPress={handleAddActivity} disabled={!newTitle.trim() || !selectedDayId} style={styles.modalBtn} />
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  fab: {
    position: 'absolute',
    bottom: spacing.xl + 8,
    right: spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
  fabText: { color: '#FFFFFF', fontSize: 28, lineHeight: 30, fontWeight: '300' },
  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.card, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl, maxHeight: '80%' },
  modalTitle: { ...typography.h2, marginBottom: spacing.lg },
  fieldLabel: { ...typography.bodySmall, fontWeight: '600', marginBottom: spacing.sm },
  categoryRow: { marginBottom: spacing.md },
  catChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, marginRight: spacing.sm },
  catChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  catIcon: { fontSize: 16, marginRight: 4 },
  catLabel: { ...typography.caption },
  catLabelActive: { color: colors.primary, fontWeight: '600' },
  modalButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  modalBtn: { flex: 1 },
});
