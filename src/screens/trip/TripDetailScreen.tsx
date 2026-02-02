import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, ImageBackground } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { getTrip } from '../../api/trips';
import { getActivitiesForTrip } from '../../api/itineraries';
import { getStops } from '../../api/stops';
import { getTripExpenseTotal } from '../../api/budgets';
import { Trip, Activity, TripStop } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { formatDateRange, getDayCount } from '../../utils/dateHelpers';
import { ACTIVITY_CATEGORIES } from '../../utils/constants';
import { CATEGORY_COLORS, formatCategoryDetail } from '../../utils/categoryFields';
import { colors, spacing, borderRadius, typography, shadows, gradients } from '../../utils/theme';
import { LoadingScreen, Card, TripBottomNav } from '../../components/common';
import { BOTTOM_NAV_HEIGHT } from '../../components/common/TripBottomNav';

type Props = NativeStackScreenProps<RootStackParamList, 'TripDetail'>;

const API_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  || '';

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

const loadGoogleMaps = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.maps) { resolve(); return; }
    const existing = document.getElementById('google-maps-script');
    if (existing) { existing.addEventListener('load', () => resolve()); return; }
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places&loading=async`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });
};

export const TripDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const insets = useSafeAreaInsets();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [activityCount, setActivityCount] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const loadData = async () => {
    try {
      const [t, activities, spent] = await Promise.all([
        getTrip(tripId),
        getActivitiesForTrip(tripId),
        getTripExpenseTotal(tripId),
      ]);
      setTrip(t);
      setActivityCount(activities.length);
      setTotalSpent(spent);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setLoading(true);
      loadData();
    });
    return unsubscribe;
  }, [navigation, tripId]);

  // Initialize map after trip loads
  useEffect(() => {
    if (!trip || Platform.OS !== 'web') return;
    let cancelled = false;

    const initMap = async () => {
      try {
        const [stops, activities] = await Promise.all([
          getStops(tripId),
          getActivitiesForTrip(tripId),
        ]);

        await loadGoogleMaps();
        if (cancelled || !mapRef.current) return;

        const center = stops.length > 0
          ? { lat: stops[0].lat, lng: stops[0].lng }
          : trip.destination_lat && trip.destination_lng
            ? { lat: trip.destination_lat, lng: trip.destination_lng }
            : { lat: 47.37, lng: 8.54 };

        const map = new google.maps.Map(mapRef.current, {
          center,
          zoom: 8,
          mapTypeControl: false,
          streetViewControl: false,
        });

        const bounds = new google.maps.LatLngBounds();
        let openInfoWindow: google.maps.InfoWindow | null = null;

        const openInfo = (iw: google.maps.InfoWindow, marker: google.maps.Marker) => {
          if (openInfoWindow) openInfoWindow.close();
          iw.open(map, marker);
          openInfoWindow = iw;
        };

        // Stop markers
        stops.forEach((stop: TripStop, i: number) => {
          const pos = { lat: stop.lat, lng: stop.lng };
          bounds.extend(pos);
          const marker = new google.maps.Marker({
            position: pos, map, title: stop.name,
            label: { text: `${i + 1}`, color: '#FFFFFF', fontWeight: 'bold' },
            icon: {
              path: google.maps.SymbolPath.CIRCLE, scale: 14,
              fillColor: stop.type === 'overnight' ? colors.primary : colors.secondary,
              fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 2,
            },
          });
          const iw = new google.maps.InfoWindow({
            content: `<div style="font-family:sans-serif"><strong>${stop.name}</strong><br/>${stop.type === 'overnight' ? `🏨 ${stop.nights} Nacht/Nächte` : '📍 Zwischenstopp'}</div>`,
          });
          marker.addListener('click', () => openInfo(iw, marker));
        });

        // Activity markers
        activities.filter((a: Activity) => a.location_lat && a.location_lng).forEach((act: Activity) => {
          const pos = { lat: act.location_lat!, lng: act.location_lng! };
          bounds.extend(pos);
          const catColor = CATEGORY_COLORS[act.category] || colors.accent;
          const marker = new google.maps.Marker({
            position: pos, map, title: act.title,
            label: { text: getCategoryIcon(act.category), fontSize: '14px' },
            icon: {
              path: google.maps.SymbolPath.CIRCLE, scale: 16,
              fillColor: catColor, fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 2,
            },
          });
          const iw = new google.maps.InfoWindow({ content: buildInfoContent(act) });
          marker.addListener('click', () => openInfo(iw, marker));
        });

        // Route
        if (stops.length >= 2) {
          const ds = new google.maps.DirectionsService();
          const waypoints = stops.slice(1, -1).map((s: TripStop) => ({
            location: new google.maps.LatLng(s.lat, s.lng), stopover: true,
          }));
          ds.route({
            origin: new google.maps.LatLng(stops[0].lat, stops[0].lng),
            destination: new google.maps.LatLng(stops[stops.length - 1].lat, stops[stops.length - 1].lng),
            waypoints, travelMode: google.maps.TravelMode.DRIVING,
          }, (result, status) => {
            if (status === 'OK' && result) {
              new google.maps.DirectionsRenderer({
                map, directions: result, suppressMarkers: true,
                polylineOptions: { strokeColor: colors.primary, strokeWeight: 4, strokeOpacity: 0.7 },
              });
            }
          });
        }

        const hasPoints = stops.length > 0 || activities.some((a: Activity) => a.location_lat);
        if (hasPoints) map.fitBounds(bounds, 60);
        setMapReady(true);
      } catch (e) {
        console.error('Map init error:', e);
      }
    };

    // Small delay to ensure the div is mounted
    const timer = setTimeout(initMap, 100);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [trip, tripId]);

  if (loading || !trip) return <LoadingScreen />;

  const days = getDayCount(trip.start_date, trip.end_date);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} bounces={false}>
        {trip.cover_image_url ? (
          <ImageBackground source={{ uri: trip.cover_image_url }} style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
            <LinearGradient colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.65)']} style={StyleSheet.absoluteFillObject} />
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                <Text style={styles.backText}>←</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate('EditTrip', { tripId })} style={styles.editBtn}>
                <Text style={styles.editText}>✏️</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.tripName}>{trip.name}</Text>
            <Text style={styles.destination}>{trip.destination}</Text>
            <Text style={styles.dates}>{formatDateRange(trip.start_date, trip.end_date)}</Text>
          </ImageBackground>
        ) : (
          <LinearGradient colors={[...gradients.ocean]} style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                <Text style={styles.backText}>←</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate('EditTrip', { tripId })} style={styles.editBtn}>
                <Text style={styles.editText}>✏️</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.tripName}>{trip.name}</Text>
            <Text style={styles.destination}>{trip.destination}</Text>
            <Text style={styles.dates}>{formatDateRange(trip.start_date, trip.end_date)}</Text>
          </LinearGradient>
        )}

        <View style={styles.content}>
          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{days}</Text>
              <Text style={styles.statLabel}>Tage</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{activityCount}</Text>
              <Text style={styles.statLabel}>Aktivitäten</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{totalSpent.toFixed(0)}</Text>
              <Text style={styles.statLabel}>{trip.currency}</Text>
            </View>
          </View>

          {/* Photos */}
          <TouchableOpacity
            style={styles.photosCard}
            onPress={() => navigation.navigate('Photos', { tripId })}
            activeOpacity={0.7}
          >
            <Text style={styles.photosIcon}>📸</Text>
            <View style={styles.photosInfo}>
              <Text style={styles.photosTitle}>Fotos</Text>
              <Text style={styles.photosSubtitle}>Reiseerinnerungen festhalten</Text>
            </View>
            <Text style={styles.photosArrow}>›</Text>
          </TouchableOpacity>

          {/* Map */}
          {Platform.OS === 'web' && (
            <Card style={styles.mapCard}>
              <Text style={styles.mapTitle}>Karte</Text>
              <div ref={mapRef} style={{ width: '100%', height: 300, borderRadius: 12 }} />
            </Card>
          )}

          {trip.notes && (
            <Card style={styles.notesCard}>
              <Text style={styles.notesTitle}>Notizen</Text>
              <Text style={styles.notesText}>{trip.notes}</Text>
            </Card>
          )}
        </View>
      </ScrollView>

      <TripBottomNav tripId={tripId} activeTab="TripDetail" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  header: { padding: spacing.xl, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  backBtn: {},
  backText: { fontSize: 24, color: '#FFFFFF' },
  editBtn: {},
  editText: { fontSize: 22, color: '#FFFFFF' },
  tripName: { ...typography.h1, color: '#FFFFFF', marginBottom: spacing.xs, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  destination: { ...typography.body, color: 'rgba(255,255,255,0.95)', marginBottom: spacing.xs, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  dates: { ...typography.bodySmall, color: 'rgba(255,255,255,0.9)', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  content: { padding: spacing.md, marginTop: -spacing.lg },
  statsRow: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.md, ...shadows.md, marginBottom: spacing.lg },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { ...typography.h2, color: colors.primary },
  statLabel: { ...typography.caption, marginTop: 2 },
  photosCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.lg, ...shadows.sm },
  photosIcon: { fontSize: 28, marginRight: spacing.md },
  photosInfo: { flex: 1 },
  photosTitle: { ...typography.body, fontWeight: '600' },
  photosSubtitle: { ...typography.caption, color: colors.textLight },
  photosArrow: { fontSize: 24, color: colors.textLight },
  mapCard: { marginBottom: spacing.lg, overflow: 'hidden' },
  mapTitle: { ...typography.h3, marginBottom: spacing.sm },
  notesCard: { marginBottom: spacing.lg },
  notesTitle: { ...typography.h3, marginBottom: spacing.sm },
  notesText: { ...typography.body, color: colors.textSecondary },
});
