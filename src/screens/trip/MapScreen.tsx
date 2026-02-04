import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Header, Card, Button, Input, TimePickerInput, PlaceAutocomplete, CategoryFieldsInput } from '../../components/common';
import { PlaceResult } from '../../components/common/PlaceAutocomplete';
import { getActivitiesForTrip, getDays, createActivity } from '../../api/itineraries';
import { getStops } from '../../api/stops';
import { getTrip } from '../../api/trips';
import { Activity, TripStop, ItineraryDay } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { ACTIVITY_CATEGORIES } from '../../utils/constants';
import { CATEGORY_COLORS, formatCategoryDetail } from '../../utils/categoryFields';
import { formatDateShort } from '../../utils/dateHelpers';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

export const MapScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const mapRef = useRef<MapView>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [selected, setSelected] = useState<Activity | null>(null);
  const [selectedStop, setSelectedStop] = useState<TripStop | null>(null);
  const [region, setRegion] = useState({
    latitude: 47.3769,
    longitude: 8.5417,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  });

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

  const loadData = useCallback(async () => {
    try {
      const [trip, fetchedStops, acts, fetchedDays] = await Promise.all([
        getTrip(tripId),
        getStops(tripId),
        getActivitiesForTrip(tripId),
        getDays(tripId),
      ]);

      if (trip.destination_lat && trip.destination_lng) {
        setRegion(r => ({ ...r, latitude: trip.destination_lat!, longitude: trip.destination_lng! }));
      }

      setStops(fetchedStops);
      setDays(fetchedDays);
      if (fetchedDays.length > 0 && !selectedDayId) {
        setSelectedDayId(fetchedDays[0].id);
      }

      const geoActivities = acts.filter(a => a.location_lat && a.location_lng);
      setActivities(geoActivities);

      // Fit to all coordinates
      const allCoords: { latitude: number; longitude: number }[] = [];
      geoActivities.forEach(a => allCoords.push({ latitude: a.location_lat!, longitude: a.location_lng! }));
      fetchedStops.forEach(s => allCoords.push({ latitude: s.lat, longitude: s.lng }));

      // Include transport station coords
      acts.filter(a => a.category === 'transport').forEach(a => {
        const cd = a.category_data || {};
        if (cd.departure_station_lat && cd.departure_station_lng) {
          allCoords.push({ latitude: cd.departure_station_lat, longitude: cd.departure_station_lng });
        }
        if (cd.arrival_station_lat && cd.arrival_station_lng) {
          allCoords.push({ latitude: cd.arrival_station_lat, longitude: cd.arrival_station_lng });
        }
      });

      if (allCoords.length > 0 && mapRef.current) {
        mapRef.current.fitToCoordinates(allCoords, {
          edgePadding: { top: 80, right: 40, bottom: 200, left: 40 },
          animated: true,
        });
      }
    } catch (e) {
      console.error(e);
    }
  }, [tripId]);

  useEffect(() => { loadData(); }, [loadData]);

  const getCategoryIcon = (cat: string) => ACTIVITY_CATEGORIES.find(c => c.id === cat)?.icon || '📌';

  // Transport routes
  const transportRoutes = activities
    .filter(a => a.category === 'transport')
    .map(a => {
      const cd = a.category_data || {};
      if (cd.departure_station_lat && cd.departure_station_lng && cd.arrival_station_lat && cd.arrival_station_lng) {
        return {
          id: a.id,
          activity: a,
          dep: { latitude: cd.departure_station_lat, longitude: cd.departure_station_lng },
          arr: { latitude: cd.arrival_station_lat, longitude: cd.arrival_station_lng },
          depName: cd.departure_station_name || 'Abfahrt',
          arrName: cd.arrival_station_name || 'Ankunft',
        };
      }
      return null;
    })
    .filter(Boolean) as {
      id: string;
      activity: Activity;
      dep: { latitude: number; longitude: number };
      arr: { latitude: number; longitude: number };
      depName: string;
      arrName: string;
    }[];

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
        sort_order: activities.length,
        check_in_date: newCategoryData.check_in_date || null,
        check_out_date: newCategoryData.check_out_date || null,
        category_data: newCategoryData,
      });
      setShowModal(false);
      resetForm();
      await loadData();
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
      <MapView ref={mapRef} style={styles.map} initialRegion={region} showsUserLocation showsMyLocationButton>
        {/* Stop markers */}
        {stops.map((stop, i) => (
          <Marker
            key={`stop-${stop.id}`}
            coordinate={{ latitude: stop.lat, longitude: stop.lng }}
            title={stop.name}
            onPress={() => { setSelectedStop(stop); setSelected(null); }}
          >
            <View style={[styles.stopMarker, { backgroundColor: stop.type === 'overnight' ? colors.primary : colors.secondary }]}>
              <Text style={styles.stopMarkerText}>{i + 1}</Text>
            </View>
          </Marker>
        ))}

        {/* Activity markers with category colors */}
        {activities.map(activity => (
          <Marker
            key={activity.id}
            coordinate={{ latitude: activity.location_lat!, longitude: activity.location_lng! }}
            title={activity.title}
            description={activity.location_name || undefined}
            pinColor={CATEGORY_COLORS[activity.category] || colors.accent}
            onPress={() => { setSelected(activity); setSelectedStop(null); }}
          />
        ))}

        {/* Transport routes */}
        {transportRoutes.map(tr => (
          <React.Fragment key={`route-${tr.id}`}>
            <Marker coordinate={tr.dep} title={tr.depName} onPress={() => { setSelected(tr.activity); setSelectedStop(null); }}>
              <View style={[styles.transportMarker, { backgroundColor: CATEGORY_COLORS.transport }]}>
                <Text style={styles.transportMarkerText}>🛫</Text>
              </View>
            </Marker>
            <Marker coordinate={tr.arr} title={tr.arrName} onPress={() => { setSelected(tr.activity); setSelectedStop(null); }}>
              <View style={[styles.transportMarker, { backgroundColor: CATEGORY_COLORS.transport }]}>
                <Text style={styles.transportMarkerText}>🛬</Text>
              </View>
            </Marker>
            <Polyline
              coordinates={[tr.dep, tr.arr]}
              strokeColor={CATEGORY_COLORS.transport}
              strokeWidth={3}
              lineDashPattern={[10, 6]}
            />
          </React.Fragment>
        ))}
      </MapView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Selected activity bottom sheet */}
      {selected && (
        <Card style={styles.bottomSheet}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setSelected(null)}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.sheetContent}>
            <Text style={styles.sheetIcon}>{getCategoryIcon(selected.category)}</Text>
            <View style={styles.sheetInfo}>
              <Text style={styles.sheetTitle}>{selected.title}</Text>
              {(() => {
                const sortedD = [...days].sort((a, b) => a.date.localeCompare(b.date));
                const dayIdx = sortedD.findIndex(d => d.id === selected.day_id);
                if (dayIdx >= 0) {
                  return <Text style={[styles.sheetTime, { fontWeight: '600' }]}>Tag {dayIdx + 1} · {formatDateShort(sortedD[dayIdx].date)}</Text>;
                }
                return null;
              })()}
              {selected.location_name && <Text style={styles.sheetLocation}>📍 {selected.location_name}</Text>}
              {selected.start_time && <Text style={styles.sheetTime}>🕐 {selected.start_time}</Text>}
              {(() => {
                const detail = formatCategoryDetail(selected.category, selected.category_data || {});
                return detail ? <Text style={[styles.sheetTime, { color: CATEGORY_COLORS[selected.category] }]}>{detail}</Text> : null;
              })()}
            </View>
          </View>
          {selected.description && <Text style={styles.sheetDesc}>{selected.description}</Text>}
        </Card>
      )}

      {/* Selected stop bottom sheet */}
      {selectedStop && (
        <Card style={styles.bottomSheet}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedStop(null)}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.sheetContent}>
            <View style={[styles.stopMarkerSmall, { backgroundColor: selectedStop.type === 'overnight' ? colors.primary : colors.secondary }]}>
              <Text style={styles.stopMarkerText}>{stops.indexOf(selectedStop) + 1}</Text>
            </View>
            <View style={styles.sheetInfo}>
              <Text style={styles.sheetTitle}>{selectedStop.name}</Text>
              <Text style={styles.sheetLocation}>
                {selectedStop.type === 'overnight' ? '🏠 Übernachtung' : '📍 Zwischenstopp'}
                {selectedStop.nights ? ` · ${selectedStop.nights} Nacht/Nächte` : ''}
              </Text>
              {selectedStop.arrival_date && selectedStop.departure_date && (
                <Text style={styles.sheetTime}>{selectedStop.arrival_date} – {selectedStop.departure_date}</Text>
              )}
              {selectedStop.address && <Text style={styles.sheetDesc}>{selectedStop.address}</Text>}
            </View>
          </View>
        </Card>
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
  container: { flex: 1 },
  map: { flex: 1 },
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
  stopMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  stopMarkerSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    marginRight: spacing.md,
  },
  stopMarkerText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 12 },
  transportMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  transportMarkerText: { fontSize: 14 },
  bottomSheet: { position: 'absolute', bottom: spacing.xl, left: spacing.md, right: spacing.md, ...shadows.lg },
  closeBtn: { position: 'absolute', top: spacing.sm, right: spacing.sm, zIndex: 1 },
  closeText: { fontSize: 18, color: colors.textLight },
  sheetContent: { flexDirection: 'row', alignItems: 'center' },
  sheetIcon: { fontSize: 32, marginRight: spacing.md },
  sheetInfo: { flex: 1 },
  sheetTitle: { ...typography.h3 },
  sheetLocation: { ...typography.bodySmall, marginTop: 2 },
  sheetTime: { ...typography.caption, color: colors.primary, marginTop: 2 },
  sheetDesc: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.sm },
  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.card, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl, maxHeight: '80%' },
  modalTitle: { ...typography.h2, marginBottom: spacing.lg },
  fieldLabel: { ...typography.bodySmall, fontWeight: '600', marginBottom: spacing.sm },
  categoryRow: { marginBottom: spacing.md },
  catChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm + 4, paddingVertical: spacing.sm, minHeight: 44, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, marginRight: spacing.sm },
  catChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  catIcon: { fontSize: 16, marginRight: 4 },
  catLabel: { ...typography.caption },
  catLabelActive: { color: colors.primary, fontWeight: '600' },
  modalButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  modalBtn: { flex: 1 },
});
