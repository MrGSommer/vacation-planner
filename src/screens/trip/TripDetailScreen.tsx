import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, ImageBackground, Linking } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTrip } from '../../api/trips';
import { getActivitiesForTrip } from '../../api/itineraries';
import { getStops } from '../../api/stops';
import { getTripExpenseTotal } from '../../api/budgets';
import { getCollaborators, CollaboratorWithProfile } from '../../api/invitations';
import { Trip, Activity, TripStop } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { formatDateRange, getDayCount } from '../../utils/dateHelpers';
import { ACTIVITY_CATEGORIES } from '../../utils/constants';
import { CATEGORY_COLORS, formatCategoryDetail } from '../../utils/categoryFields';
import { colors, spacing, borderRadius, typography, shadows, gradients } from '../../utils/theme';
import { LoadingScreen, Card, TripBottomNav, Avatar } from '../../components/common';
import { BOTTOM_NAV_HEIGHT } from '../../components/common/TripBottomNav';
import { importMapsLibrary } from '../../components/common/PlaceAutocomplete';

type Props = NativeStackScreenProps<RootStackParamList, 'TripDetail'>;

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

export const TripDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const insets = useSafeAreaInsets();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [activityCount, setActivityCount] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [collaborators, setCollaborators] = useState<CollaboratorWithProfile[]>([]);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const mapInstanceRef = useRef<any>(null);
  const mapInitializedRef = useRef(false);

  const loadData = async () => {
    try {
      const [t, activities, spent, collabs] = await Promise.all([
        getTrip(tripId),
        getActivitiesForTrip(tripId),
        getTripExpenseTotal(tripId),
        getCollaborators(tripId).catch(() => []),
      ]);
      setTrip(t);
      setActivityCount(activities.length);
      setTotalSpent(spent);
      setCollaborators(collabs);
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

  // Initialize map after trip loads (only once per tripId)
  useEffect(() => {
    if (!trip || Platform.OS !== 'web') return;
    if (mapInitializedRef.current) return;
    let cancelled = false;

    const initMap = async () => {
      try {
        const [stops, activities] = await Promise.all([
          getStops(tripId),
          getActivitiesForTrip(tripId),
        ]);

        const mapsLib = await importMapsLibrary('maps');
        const markerLib = await importMapsLibrary('marker');
        await importMapsLibrary('routes');
        await importMapsLibrary('core');

        if (cancelled || !mapRef.current) return;

        const center = stops.length > 0
          ? { lat: stops[0].lat, lng: stops[0].lng }
          : trip.destination_lat && trip.destination_lng
            ? { lat: trip.destination_lat, lng: trip.destination_lng }
            : { lat: 47.37, lng: 8.54 };

        const map = new mapsLib.Map(mapRef.current, {
          center,
          zoom: 8,
          mapTypeControl: false,
          streetViewControl: false,
          mapId: 'vacation-planner-map',
        });
        mapInstanceRef.current = map;

        const bounds = new google.maps.LatLngBounds();
        let openInfoWindow: google.maps.InfoWindow | null = null;

        const openInfo = (iw: google.maps.InfoWindow, anchor: any) => {
          if (openInfoWindow) openInfoWindow.close();
          iw.open({ map, anchor });
          openInfoWindow = iw;
        };

        const { AdvancedMarkerElement, PinElement } = markerLib;

        stops.forEach((stop: TripStop, i: number) => {
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
            content: pin.element,
          });
          const iw = new google.maps.InfoWindow({
            content: `<div style="font-family:sans-serif"><strong>${stop.name}</strong><br/>${stop.type === 'overnight' ? `🏨 ${stop.nights} Nacht/Nächte` : '📍 Zwischenstopp'}</div>`,
          });
          marker.addListener('click', () => openInfo(iw, marker));
        });

        activities.filter((a: Activity) => a.location_lat && a.location_lng).forEach((act: Activity) => {
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
            content: pin.element,
          });
          const iw = new google.maps.InfoWindow({ content: buildInfoContent(act) });
          marker.addListener('click', () => openInfo(iw, marker));
        });

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
        mapInitializedRef.current = true;
        setMapReady(true);
      } catch (e) {
        console.error('Map init error:', e);
      }
    };

    initMap();
    return () => { cancelled = true; };
  }, [trip, tripId]);

  // Reset map init flag when tripId changes
  useEffect(() => {
    mapInitializedRef.current = false;
    setMapReady(false);
  }, [tripId]);

  // Handle fullscreen toggle
  useEffect(() => {
    if (Platform.OS !== 'web' || !mapRef.current || !mapInstanceRef.current) return;
    const el = mapRef.current;
    if (mapFullscreen) {
      el.style.position = 'fixed';
      el.style.top = '0';
      el.style.left = '0';
      el.style.width = '100vw';
      el.style.height = '100vh';
      el.style.zIndex = '9999';
      el.style.borderRadius = '0';
    } else {
      el.style.position = '';
      el.style.top = '';
      el.style.left = '';
      el.style.width = '100%';
      el.style.height = '300px';
      el.style.zIndex = '';
      el.style.borderRadius = '12px';
    }
    setTimeout(() => google.maps.event.trigger(mapInstanceRef.current, 'resize'), 50);
  }, [mapFullscreen]);

  if (loading || !trip) return <LoadingScreen />;

  const days = getDayCount(trip.start_date, trip.end_date);
  const nonOwnerCollabs = collaborators.filter(c => c.role !== 'owner');

  const headerContent = (
    <>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          {nonOwnerCollabs.length > 0 && (
            <View style={styles.avatarRow}>
              {nonOwnerCollabs.slice(0, 4).map((c, i) => (
                <View key={c.id} style={[styles.avatarWrap, i > 0 && { marginLeft: -8 }]}>
                  <Avatar
                    uri={c.profile.avatar_url}
                    name={c.profile.full_name || c.profile.email}
                    size={28}
                  />
                </View>
              ))}
              {nonOwnerCollabs.length > 4 && (
                <View style={[styles.avatarWrap, { marginLeft: -8 }]}>
                  <View style={styles.avatarOverflow}>
                    <Text style={styles.avatarOverflowText}>+{nonOwnerCollabs.length - 4}</Text>
                  </View>
                </View>
              )}
            </View>
          )}
          <TouchableOpacity onPress={() => navigation.navigate('EditTrip', { tripId })} style={styles.editBtn}>
            <Text style={styles.editText}>✏️</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.tripName}>{trip.name}</Text>
      <Text style={styles.destination}>{trip.destination}</Text>
      <Text style={styles.dates}>{formatDateRange(trip.start_date, trip.end_date)}</Text>
    </>
  );

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} bounces={false}>
        {trip.cover_image_url ? (
          <ImageBackground source={{ uri: trip.cover_image_url }} style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
            <LinearGradient colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.65)']} style={StyleSheet.absoluteFillObject} />
            {headerContent}
            {trip.cover_image_attribution && (() => {
              const parts = trip.cover_image_attribution.split('|');
              const userName = parts[0];
              const userLink = parts[1] ? `${parts[1]}?utm_source=vacation_planner&utm_medium=referral` : '';
              const unsplashLink = 'https://unsplash.com/?utm_source=vacation_planner&utm_medium=referral';
              return (
                <Text style={styles.attribution}>
                  {'Foto: '}
                  <Text style={styles.attributionLink} onPress={() => userLink && Linking.openURL(userLink)}>{userName}</Text>
                  {' / '}
                  <Text style={styles.attributionLink} onPress={() => Linking.openURL(unsplashLink)}>Unsplash</Text>
                </Text>
              );
            })()}
          </ImageBackground>
        ) : (
          <LinearGradient colors={[...gradients.ocean]} style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
            {headerContent}
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
              <View style={styles.mapHeader}>
                <Text style={styles.mapTitle}>Karte</Text>
                {mapReady && (
                  <TouchableOpacity onPress={() => setMapFullscreen(true)} style={styles.fullscreenBtn}>
                    <Text style={styles.fullscreenBtnText}>⛶</Text>
                  </TouchableOpacity>
                )}
              </View>
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

      {Platform.OS === 'web' && mapFullscreen && (
        <TouchableOpacity
          onPress={() => setMapFullscreen(false)}
          style={[styles.fullscreenCloseBtn, { top: insets.top + spacing.sm }]}
        >
          <Text style={styles.fullscreenCloseText}>← Schliessen</Text>
        </TouchableOpacity>
      )}
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderRadius: 16, overflow: 'hidden' },
  avatarOverflow: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  avatarOverflowText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  editBtn: {},
  editText: { fontSize: 22, color: '#FFFFFF' },
  tripName: { ...typography.h1, color: '#FFFFFF', marginBottom: spacing.xs, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  destination: { ...typography.body, color: 'rgba(255,255,255,0.95)', marginBottom: spacing.xs, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  dates: { ...typography.bodySmall, color: 'rgba(255,255,255,0.9)', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  attribution: { ...typography.caption, fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: spacing.xs },
  attributionLink: { textDecorationLine: 'underline' },
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
  mapHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  mapTitle: { ...typography.h3 },
  fullscreenBtn: { padding: spacing.xs },
  fullscreenBtnText: { fontSize: 20, color: colors.primary },
  fullscreenCloseBtn: { position: 'absolute' as any, left: spacing.md, zIndex: 10000, backgroundColor: colors.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.lg, ...shadows.md },
  fullscreenCloseText: { ...typography.body, fontWeight: '600' as const, color: colors.primary },
  notesCard: { marginBottom: spacing.lg },
  notesTitle: { ...typography.h3, marginBottom: spacing.sm },
  notesText: { ...typography.body, color: colors.textSecondary },
});
