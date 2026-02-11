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
import { formatDateRange, getDayCount, formatDateShort } from '../../utils/dateHelpers';
import { ACTIVITY_CATEGORIES } from '../../utils/constants';
import { CATEGORY_COLORS, formatCategoryDetail } from '../../utils/categoryFields';
import { colors, spacing, borderRadius, typography, shadows, gradients } from '../../utils/theme';
import { linkifyText } from '../../utils/linkify';
import { getDisplayName } from '../../utils/profileHelpers';
import { Card, TripBottomNav, Avatar, ActivityModal } from '../../components/common';
import type { ActivityFormData } from '../../components/common';
import { TripDetailSkeleton } from '../../components/skeletons/TripDetailSkeleton';
import { AiTripModal } from '../../components/ai/AiTripModal';
import { UpgradePrompt } from '../../components/common/UpgradePrompt';
import { ShareModal } from '../home/ShareModal';
import { ClearTripModal } from '../../components/common/ClearTripModal';
import { useAuthContext } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { BOTTOM_NAV_HEIGHT } from '../../components/common/TripBottomNav';
import { importMapsLibrary, PlaceAutocomplete, PlaceResult } from '../../components/common/PlaceAutocomplete';
import { detectCategoryFromTypes } from '../../utils/categoryFields';
import { createActivity, createDay, getDays } from '../../api/itineraries';
import { exportKML } from '../../utils/geoImport';

type Props = NativeStackScreenProps<RootStackParamList, 'TripDetail'>;

const getCategoryIcon = (cat: string) => ACTIVITY_CATEGORIES.find(c => c.id === cat)?.icon || '📌';

interface DayInfo { date: string; dayNumber: number; }

function buildInfoContent(act: Activity, dayInfo?: DayInfo): string {
  const icon = getCategoryIcon(act.category);
  const catData = act.category_data || {};
  const detail = formatCategoryDetail(act.category, catData);
  let html = `<div style="font-family:sans-serif;min-width:180px"><strong>${icon} ${act.title}</strong>`;
  if (dayInfo) html += `<br/><span style="color:${colors.primary};font-size:12px;font-weight:600">Tag ${dayInfo.dayNumber} · ${formatDateShort(dayInfo.date)}</span>`;
  if (act.location_name) html += `<br/><small>📍 ${act.location_name}</small>`;
  if (detail) html += `<br/><span style="color:${CATEGORY_COLORS[act.category] || '#666'};font-size:13px">${detail}</span>`;
  if (act.description) html += `<br/><small style="color:#636E72">${act.description}</small>`;
  html += '</div>';
  return html;
}

export const TripDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const { user } = useAuthContext();
  const { isFeatureAllowed, aiCredits } = useSubscription();
  const insets = useSafeAreaInsets();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [activityCount, setActivityCount] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [collaborators, setCollaborators] = useState<CollaboratorWithProfile[]>([]);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const mapInstanceRef = useRef<any>(null);
  const mapInitializedRef = useRef(false);
  const activitiesRef = useRef<Activity[]>([]);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [addActivityDefaults, setAddActivityDefaults] = useState<{ category: string; categoryData: Record<string, any>; title?: string; locationName?: string; locationLat?: number | null; locationLng?: number | null; locationAddress?: string | null } | null>(null);
  const [showMapSearch, setShowMapSearch] = useState(false);

  const loadData = async () => {
    try {
      const [t, activities, spent, collabs] = await Promise.all([
        getTrip(tripId),
        getActivitiesForTrip(tripId),
        getTripExpenseTotal(tripId),
        getCollaborators(tripId).catch(() => []),
      ]);
      setTrip(t);
      activitiesRef.current = activities;
      setActivityCount(activities.length);
      setTotalSpent(spent);
      setCollaborators(collabs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleMapPlaceSelect = (place: PlaceResult) => {
    const category = detectCategoryFromTypes(place.types);
    const categoryData: Record<string, any> = {};
    if (place.website) categoryData.website_url = place.website;
    if (category === 'hotel' && trip) {
      categoryData.check_in_date = trip.start_date;
      categoryData.check_out_date = trip.end_date;
    }
    setAddActivityDefaults({
      category,
      categoryData,
      title: place.name,
      locationName: place.name,
      locationLat: place.lat,
      locationLng: place.lng,
      locationAddress: place.address,
    });
    setShowMapSearch(false);
    setShowAddActivity(true);
  };

  const handleSaveMapActivity = async (data: ActivityFormData) => {
    if (!trip) return;
    try {
      // Find or create day (use first day of trip)
      const days = await getDays(tripId);
      let dayId: string;
      if (days.length > 0) {
        dayId = days[0].id;
      } else {
        const newDay = await createDay(tripId, trip.start_date);
        dayId = newDay.id;
      }
      await createActivity({
        day_id: dayId,
        trip_id: tripId,
        title: data.title,
        description: data.notes || null,
        category: data.category,
        start_time: data.startTime || null,
        end_time: null,
        location_name: data.locationName || null,
        location_lat: data.locationLat,
        location_lng: data.locationLng,
        location_address: data.locationAddress,
        cost: null,
        currency: trip.currency,
        sort_order: activityCount,
        check_in_date: data.categoryData?.check_in_date || null,
        check_out_date: data.categoryData?.check_out_date || null,
        category_data: data.categoryData || {},
      });
      setShowAddActivity(false);
      setAddActivityDefaults(null);
      mapInitializedRef.current = false;
      mapInstanceRef.current = null;
      setMapReady(false);
      loadData();
    } catch (e) {
      console.error('Failed to add activity from map:', e);
    }
  };

  const handleExportToMaps = () => {
    if (!trip) return;
    const activities = activitiesRef.current;
    const kml = exportKML(trip.name, activities);
    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${trip.name.replace(/[^a-zA-Z0-9äöüÄÖÜ ]/g, '_')}.kml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setLoading(true);
      mapInitializedRef.current = false;
      mapInstanceRef.current = null;
      setMapReady(false);
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
        const [stops, fetchedDays] = await Promise.all([
          getStops(tripId),
          getDays(tripId),
        ]);
        const activities = activitiesRef.current;

        const sortedDays = [...fetchedDays].sort((a, b) => a.date.localeCompare(b.date));
        const dayInfoMap: Record<string, DayInfo> = {};
        sortedDays.forEach((d, i) => { dayInfoMap[d.id] = { date: d.date, dayNumber: i + 1 }; });

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
            content: pin,
            gmpClickable: true,
          });
          const iw = new google.maps.InfoWindow({
            content: `<div style="font-family:sans-serif"><strong>${stop.name}</strong><br/>${stop.type === 'overnight' ? `🏠 ${stop.nights} Nacht/Nächte` : '📍 Zwischenstopp'}</div>`,
          });
          marker.addEventListener('gmp-click', () => openInfo(iw, marker));
        });

        activities.filter((a: Activity) => a.location_lat && a.location_lng).forEach((act: Activity) => {
          const pos = { lat: act.location_lat!, lng: act.location_lng! };
          bounds.extend(pos);
          const catColor = CATEGORY_COLORS[act.category] || colors.accent;
          const pin = new PinElement({
            background: catColor,
            borderColor: '#FFFFFF',
            glyphColor: '#FFFFFF',
          });
          const marker = new AdvancedMarkerElement({
            position: pos, map, title: act.title,
            content: pin,
            gmpClickable: true,
          });
          const iw = new google.maps.InfoWindow({ content: buildInfoContent(act, dayInfoMap[act.day_id]) });
          marker.addEventListener('gmp-click', () => openInfo(iw, marker));
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

  if (loading || !trip) return <TripDetailSkeleton />;

  const days = getDayCount(trip.start_date, trip.end_date);
  const nonOwnerCollabs = collaborators.filter(c => c.user_id !== user?.id);

  const headerContent = (
    <>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          {nonOwnerCollabs.length > 0 && (
            <TouchableOpacity onPress={() => setShowShareModal(true)} activeOpacity={0.7} style={styles.avatarRow}>
              {nonOwnerCollabs.slice(0, 4).map((c, i) => (
                <View key={c.id} style={[styles.avatarWrap, i > 0 && { marginLeft: -8 }]}>
                  <Avatar
                    uri={c.profile.avatar_url}
                    name={getDisplayName(c.profile)}
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
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setShowMenu(v => !v)} style={styles.menuBtn}>
            <Text style={styles.menuText}>⋯</Text>
          </TouchableOpacity>
        </View>
      </View>
      {showMenu && (
        <>
          <TouchableOpacity style={styles.menuOverlay} onPress={() => setShowMenu(false)} activeOpacity={1} />
          <View style={styles.menuDropdown}>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); navigation.navigate('EditTrip', { tripId }); }}>
              <Text style={styles.menuIcon}>✏️</Text>
              <Text style={styles.menuLabel}>Bearbeiten</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setShowShareModal(true); }}>
              <Text style={styles.menuIcon}>🔗</Text>
              <Text style={styles.menuLabel}>Teilen & Drucken</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setShowClearModal(true); }}>
              <Text style={styles.menuIcon}>🗑️</Text>
              <Text style={[styles.menuLabel, { color: colors.error }]}>Reise leeren</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
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
          {isFeatureAllowed('photos') ? (
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
              <Text style={styles.photosArrow}>{'›'}</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ marginBottom: spacing.lg }}>
              <UpgradePrompt
                icon="📸"
                title="Fotos"
                message="Verfügbar mit Premium"
                inline
              />
            </View>
          )}

          {/* Map */}
          {Platform.OS === 'web' && (
            <Card style={styles.mapCard}>
              <View style={styles.mapHeader}>
                <Text style={styles.mapTitle}>Karte</Text>
                {mapReady && (
                  <View style={styles.mapHeaderActions}>
                    <TouchableOpacity onPress={handleExportToMaps} style={styles.fullscreenBtn}>
                      <Text style={styles.fullscreenBtnText}>{'📤'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowMapSearch(s => !s)} style={styles.fullscreenBtn}>
                      <Text style={styles.fullscreenBtnText}>{'🔍'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setMapFullscreen(true)} style={styles.fullscreenBtn}>
                      <Text style={styles.fullscreenBtnText}>⛶</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              {showMapSearch && (
                <View style={styles.mapSearchOverlay}>
                  <PlaceAutocomplete
                    placeholder="Ort suchen und hinzufügen..."
                    onSelect={handleMapPlaceSelect}
                  />
                </View>
              )}
              <div ref={mapRef} style={{ width: '100%', height: 300, borderRadius: 12 }} />
            </Card>
          )}

          {/* Fable — Reisebegleiter (hidden in fullscreen map) */}
          {!mapFullscreen && (
            isFeatureAllowed('ai') ? (
              <TouchableOpacity
                style={styles.aiCard}
                onPress={() => setShowAiModal(true)}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={[...gradients.ocean]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.aiCardGradient}
                >
                  <Text style={styles.aiCardText}>{'✨ Fable fragen'}</Text>
                  <Text style={styles.aiCardSubtext}>{`Aktivitäten und Stops generieren · ${aiCredits} Inspirationen ›`}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <View style={{ marginBottom: spacing.lg }}>
                <UpgradePrompt
                  icon="✨"
                  title="Fable — Dein Reisebegleiter"
                  message="Kaufe Inspirationen um Fable zu nutzen"
                  inline
                  buyInspirations
                />
              </View>
            )
          )}

          {!mapFullscreen && trip.notes && (
            <Card style={styles.notesCard}>
              <Text style={styles.notesTitle}>Notizen</Text>
              <Text style={styles.notesText}>{linkifyText(trip.notes)}</Text>
            </Card>
          )}
        </View>
      </ScrollView>

      <TripBottomNav tripId={tripId} activeTab="TripDetail" />

      {Platform.OS === 'web' && mapFullscreen && (
        <>
          <TouchableOpacity
            onPress={() => setMapFullscreen(false)}
            style={[styles.fullscreenCloseBtn, { top: insets.top + spacing.sm }]}
          >
            <Text style={styles.fullscreenCloseText}>← Schliessen</Text>
          </TouchableOpacity>
          <View style={[styles.fullscreenSearchBar, { top: insets.top + spacing.sm }]}>
            <PlaceAutocomplete
              placeholder="Ort suchen und hinzufügen..."
              onSelect={handleMapPlaceSelect}
            />
          </View>
          <TouchableOpacity
            onPress={handleExportToMaps}
            style={[styles.fullscreenExportBtn, { top: insets.top + spacing.sm }]}
          >
            <Text style={styles.fullscreenExportText}>{'📤 KML'}</Text>
          </TouchableOpacity>
        </>
      )}

      {showShareModal && trip && user && (
        <ShareModal
          visible={showShareModal}
          onClose={() => {
            setShowShareModal(false);
            loadData();
          }}
          tripId={trip.id}
          tripName={trip.name}
          userId={user.id}
        />
      )}

      {showClearModal && (
        <ClearTripModal
          visible={showClearModal}
          tripId={tripId}
          onClose={() => setShowClearModal(false)}
          onCleared={() => {
            setShowClearModal(false);
            mapInitializedRef.current = false;
            mapInstanceRef.current = null;
            setMapReady(false);
            loadData();
          }}
        />
      )}

      {showAiModal && trip && user && (
        <AiTripModal
          visible={showAiModal}
          onClose={() => setShowAiModal(false)}
          mode="enhance"
          tripId={tripId}
          userId={user.id}
          initialContext={{
            destination: trip.destination,
            destinationLat: trip.destination_lat,
            destinationLng: trip.destination_lng,
            startDate: trip.start_date,
            endDate: trip.end_date,
            currency: trip.currency,
            tripName: trip.name,
            notes: trip.notes,
            travelersCount: trip.travelers_count,
            groupType: trip.group_type,
          }}
          onComplete={() => {
            setShowAiModal(false);
            loadData();
          }}
        />
      )}

      {showAddActivity && addActivityDefaults && (
        <ActivityModal
          visible={showAddActivity}
          activity={{
            id: '',
            day_id: '',
            trip_id: tripId,
            title: addActivityDefaults.title || '',
            description: null,
            category: addActivityDefaults.category,
            start_time: null,
            end_time: null,
            location_name: addActivityDefaults.locationName || null,
            location_lat: addActivityDefaults.locationLat || null,
            location_lng: addActivityDefaults.locationLng || null,
            location_address: addActivityDefaults.locationAddress || null,
            cost: null,
            currency: trip?.currency || 'CHF',
            sort_order: 0,
            check_in_date: addActivityDefaults.categoryData?.check_in_date || null,
            check_out_date: addActivityDefaults.categoryData?.check_out_date || null,
            category_data: addActivityDefaults.categoryData || {},
            created_at: new Date().toISOString(),
          } as Activity}
          tripStartDate={trip?.start_date}
          tripEndDate={trip?.end_date}
          onSave={handleSaveMapActivity}
          onCancel={() => { setShowAddActivity(false); setAddActivityDefaults(null); }}
        />
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
  menuBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  menuText: { fontSize: 20, color: '#FFFFFF', fontWeight: '700', marginTop: -4 },
  menuOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  menuDropdown: { position: 'absolute', top: 52, right: spacing.xl, backgroundColor: colors.card, borderRadius: borderRadius.md, ...shadows.lg, zIndex: 11, minWidth: 190, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  menuIcon: { fontSize: 18, marginRight: spacing.sm, width: 24 },
  menuLabel: { ...typography.body, fontWeight: '500' },
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
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
  mapHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  fullscreenBtn: { padding: spacing.xs },
  fullscreenBtnText: { fontSize: 20, color: colors.primary },
  mapSearchOverlay: { marginBottom: spacing.sm, zIndex: 100 },
  fullscreenCloseBtn: { position: 'fixed' as any, left: spacing.md, zIndex: 10000, backgroundColor: colors.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.lg, ...shadows.md },
  fullscreenCloseText: { ...typography.body, fontWeight: '600' as const, color: colors.primary },
  fullscreenSearchBar: { position: 'fixed' as any, left: 140, right: 100, zIndex: 10000 },
  fullscreenExportBtn: { position: 'fixed' as any, right: spacing.md, zIndex: 10000, backgroundColor: colors.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.lg, ...shadows.md },
  fullscreenExportText: { ...typography.bodySmall, fontWeight: '600' as const, color: colors.primary },
  aiCard: { marginBottom: spacing.lg, borderRadius: borderRadius.lg, overflow: 'hidden', ...shadows.sm },
  aiCardGradient: { padding: spacing.md, flexDirection: 'column' },
  aiCardText: { ...typography.body, fontWeight: '600', color: '#FFFFFF' },
  aiCardSubtext: { ...typography.caption, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  notesCard: { marginBottom: spacing.lg },
  notesTitle: { ...typography.h3, marginBottom: spacing.sm },
  notesText: { ...typography.body, color: colors.textSecondary },
});
