import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ImageBackground, Linking, Modal, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTrip } from '../../api/trips';
import { getActivitiesForTrip } from '../../api/itineraries';
import { getStopLocations, StopLocation } from '../../api/stops';
import { getTripExpenseTotal } from '../../api/budgets';
import { getPhotos } from '../../api/photos';
import { getCollaborators, CollaboratorWithProfile } from '../../api/invitations';
import { Trip, Activity } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { formatDateRange, getDayCount, formatDateShort } from '../../utils/dateHelpers';
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
import { useTripContext } from '../../contexts/TripContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { BOTTOM_NAV_HEIGHT } from '../../components/common/TripBottomNav';
import { importMapsLibrary, PlaceAutocomplete, PlaceResult } from '../../components/common/PlaceAutocomplete';
import { detectCategoryFromTypes } from '../../utils/categoryFields';
import { createActivity, createDay, getDays } from '../../api/itineraries';
import { exportKML } from '../../utils/geoImport';
import { ensureContrast, tintWithWhite } from '../../utils/colorExtraction';
import { TripRecapCard } from '../../components/trip/TripRecapCard';
import { ChangeLog } from '../../components/common/ChangeLog';
import { usePresence } from '../../hooks/usePresence';
import { Icon } from '../../utils/icons';

type Props = NativeStackScreenProps<RootStackParamList, 'TripDetail'>;

interface DayInfo { date: string; dayNumber: number; }

function buildInfoContent(act: Activity, dayInfo?: DayInfo): string {
  const catData = act.category_data || {};
  const detail = formatCategoryDetail(act.category, catData);
  let html = `<div style="font-family:sans-serif;min-width:180px"><strong>${act.title}</strong>`;
  if (dayInfo) html += `<br/><span style="color:${colors.primary};font-size:12px;font-weight:600">Tag ${dayInfo.dayNumber} · ${formatDateShort(dayInfo.date)}</span>`;
  if (act.location_name) html += `<br/><small>${act.location_name}</small>`;
  if (detail) html += `<br/><span style="color:${CATEGORY_COLORS[act.category] || '#666'};font-size:13px">${detail}</span>`;
  if (act.description) html += `<br/><small style="color:#636E72">${act.description}</small>`;
  html += '</div>';
  return html;
}

export const TripDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const { user } = useAuthContext();
  const { trips: allTrips } = useTripContext();
  const { isFeatureAllowed, aiCredits, isTripEditable, isPremium } = useSubscription();
  const insets = useSafeAreaInsets();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [activityCount, setActivityCount] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [photoCount, setPhotoCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [collaborators, setCollaborators] = useState<CollaboratorWithProfile[]>([]);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const menuBtnRef = useRef<View>(null);
  const MENU_HEIGHT = 200;
  const [showClearModal, setShowClearModal] = useState(false);
  const [showChangeLog, setShowChangeLog] = useState(false);
  const presenceUsers = usePresence(tripId, 'TripDetail');
  const mapInstanceRef = useRef<any>(null);
  const mapInitializedRef = useRef(false);
  const activitiesRef = useRef<Activity[]>([]);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [addActivityDefaults, setAddActivityDefaults] = useState<{ category: string; categoryData: Record<string, any>; title?: string; locationName?: string; locationLat?: number | null; locationLng?: number | null; locationAddress?: string | null } | null>(null);
  const [showMapSearch, setShowMapSearch] = useState(false);

  const loadData = async () => {
    try {
      const [t, activities, spent, collabs, photos] = await Promise.all([
        getTrip(tripId),
        getActivitiesForTrip(tripId),
        getTripExpenseTotal(tripId).catch(() => 0),
        getCollaborators(tripId).catch(() => []),
        getPhotos(tripId).catch(() => []),
      ]);
      setTrip(t);
      activitiesRef.current = activities;
      setActivityCount(activities.length);
      setTotalSpent(spent);
      setCollaborators(collabs);
      setPhotoCount(photos.length);
    } catch (e) {
      console.error(e);
      // Offline fallback: try loading trip from localStorage cache
      if (!trip) {
        try {
          const { loadFromStorage } = await import('../../utils/queryCache');
          const stored = loadFromStorage<Trip>(`trip:${tripId}`);
          if (stored) setTrip(stored.data);
        } catch {}
      }
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

  // Reopen Fable modal when returning from FableTripSettings
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if ((route.params as any)?.openFable) {
        setShowAiModal(true);
        navigation.setParams({ openFable: undefined } as any);
      }
    });
    return unsubscribe;
  }, [navigation, route.params]);

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
          getStopLocations(tripId),
          getDays(tripId),
        ]);
        const activities = activitiesRef.current;

        const sortedDays = [...fetchedDays].sort((a, b) => a.date.localeCompare(b.date));
        const dayInfoMap: Record<string, DayInfo> = {};
        sortedDays.forEach((d, i) => { dayInfoMap[d.id] = { date: d.date, dayNumber: i + 1 }; });

        const mapsLib = await importMapsLibrary('maps');
        const markerLib = await importMapsLibrary('marker');
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
          mapId: '5617c0f0247bb2e3f910e4fd',
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

        stops.forEach((stop: StopLocation, i: number) => {
          const pos = { lat: stop.lat, lng: stop.lng };
          bounds.extend(pos);
          const pin = new PinElement({
            background: stop.type === 'overnight' ? colors.primary : colors.secondary,
            borderColor: '#FFFFFF',
            glyphText: `${i + 1}`,
            glyphColor: '#FFFFFF',
          });
          const marker = new AdvancedMarkerElement({
            position: pos, map, title: stop.name,
            content: pin,
            gmpClickable: true,
          });
          const iw = new google.maps.InfoWindow({
            content: `<div style="font-family:sans-serif"><strong>${stop.name}</strong><br/>${stop.type === 'overnight' ? `${stop.nights} Nacht/Nächte` : 'Zwischenstopp'}</div>`,
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

        const hasPoints = stops.length > 0 || activities.some((a: Activity) => a.location_lat);
        if (hasPoints) {
          map.fitBounds(bounds, 30);
          // Prevent over-zoom on single point
          google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
            if ((map.getZoom() || 0) > 15) map.setZoom(15);
          });
        }
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

  const editable = isTripEditable(tripId, allTrips);

  const rawThemeColor = trip.theme_color || colors.secondary;
  const themeColor = ensureContrast(rawThemeColor);
  const themeTint = tintWithWhite(rawThemeColor, 0.92);

  const days = getDayCount(trip.start_date, trip.end_date);
  const nonOwnerCollabs = collaborators.filter(c => c.user_id !== user?.id);

  const headerContent = (
    <>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.navigate('Main' as any, { screen: 'Home' })} style={styles.backBtn}>
          <Icon name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerRight}>
          {nonOwnerCollabs.length > 0 && (
            <TouchableOpacity onPress={() => setShowShareModal(true)} activeOpacity={0.7} style={styles.avatarRow}>
              {nonOwnerCollabs.slice(0, 4).map((c, i) => {
                const isOnline = presenceUsers.some(p => p.userId === c.user_id);
                return (
                  <View key={c.id} style={[styles.avatarWrap, i > 0 && { marginLeft: -8 }, isOnline && { borderColor: '#A855F7' }]}>
                    <Avatar
                      uri={c.profile.avatar_url}
                      name={getDisplayName(c.profile)}
                      size={28}
                    />
                  </View>
                );
              })}
              {nonOwnerCollabs.length > 4 && (
                <View style={[styles.avatarWrap, { marginLeft: -8 }]}>
                  <View style={styles.avatarOverflow}>
                    <Text style={styles.avatarOverflowText}>+{nonOwnerCollabs.length - 4}</Text>
                  </View>
                </View>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            ref={menuBtnRef}
            onPress={() => {
              if (menuBtnRef.current) {
                (menuBtnRef.current as any).measureInWindow?.((x: number, y: number, w: number, h: number) => {
                  const screenW = typeof window !== 'undefined' ? window.innerWidth : 400;
                  const screenH = typeof window !== 'undefined' ? window.innerHeight : 800;
                  const rightPos = Math.max(8, screenW - x - w);
                  const belowY = y + h + 4;
                  if (belowY + MENU_HEIGHT > screenH && y - MENU_HEIGHT - 4 >= 0) {
                    setMenuPos({ bottom: screenH - y + 4, right: rightPos });
                  } else {
                    setMenuPos({ top: Math.min(belowY, screenH - MENU_HEIGHT - 8), right: rightPos });
                  }
                  setShowMenu(true);
                }) || setShowMenu(true);
              } else {
                setShowMenu(true);
              }
            }}
            style={styles.menuBtn}
          >
            <Icon name="ellipsis-horizontal" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.tripNameRow}>
        <Text style={styles.tripName}>{trip.name}</Text>
        {trip.status === 'completed' && (
          <View style={styles.erlebtBadge}>
            <Text style={styles.erlebtBadgeText}>Erlebt</Text>
          </View>
        )}
      </View>
      <Text style={styles.destination}>{trip.destination}</Text>
      <Text style={styles.dates}>{formatDateRange(trip.start_date, trip.end_date)}</Text>
    </>
  );

  return (
    <View style={styles.container}>
      <View style={styles.dashboardLayout}>
        {/* Header */}
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
          <LinearGradient colors={trip.theme_color ? [themeColor, rawThemeColor + 'CC'] : [...gradients.ocean]} style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
            {headerContent}
          </LinearGradient>
        )}

        {/* When notes exist: scrollable layout. Otherwise: fixed layout with map filling space */}
        {trip.notes ? (
        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: spacing.lg }}>
          {/* Stats */}
          <View style={[styles.statsRow, { backgroundColor: themeTint }]}>
            <TouchableOpacity style={styles.stat} onPress={() => navigation.replace('Itinerary', { tripId })} activeOpacity={0.7}>
              <Text style={[styles.statValue, { color: themeColor }]}>{days}</Text>
              <Text style={styles.statLabel}>Tage</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stat} onPress={() => navigation.replace('Itinerary', { tripId })} activeOpacity={0.7}>
              <Text style={[styles.statValue, { color: themeColor }]}>{activityCount}</Text>
              <Text style={styles.statLabel}>Aktivitäten</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stat} onPress={() => navigation.replace('Budget', { tripId })} activeOpacity={0.7}>
              <Text style={[styles.statValue, { color: themeColor }]}>{totalSpent.toFixed(0)}</Text>
              <Text style={styles.statLabel}>{trip.currency}</Text>
            </TouchableOpacity>
          </View>

          {/* Photos + Fable Grid */}
          <View style={styles.gridRow}>
            <TouchableOpacity
              style={[styles.gridCard, { backgroundColor: themeTint }]}
              onPress={() => navigation.navigate('Photos', { tripId })}
              activeOpacity={0.7}
            >
              <Icon name="images" size={22} color={colors.primary} />
              <Text style={[styles.gridCardTitle, { color: themeColor }]}>Fotos</Text>
              {photoCount > 0 && <Text style={[styles.gridCardInfo, { color: themeColor }]}>{photoCount}</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.gridCard, { backgroundColor: themeTint }]}
              onPress={() => setShowAiModal(true)}
              activeOpacity={0.7}
            >
              <Icon name="sparkles" size={22} color={colors.accent} />
              <Text style={[styles.gridCardTitle, { color: colors.accent }]}>Fable</Text>
              <Text style={[styles.gridCardInfo, { color: colors.accent }]}>
                {isPremium ? 'Inklusive' : aiCredits > 0 ? `${aiCredits} Inspirationen` : 'Reisebegleiter'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Post-Trip Recap */}
          {trip.status === 'completed' && (
            <TripRecapCard trip={trip} activityCount={activityCount} totalSpent={totalSpent} />
          )}

          {/* Map — fixed height when notes present */}
          {Platform.OS === 'web' && (
            <Card style={[styles.mapCard, { height: 350, backgroundColor: themeTint }]}>
              <View style={styles.mapHeader}>
                <View style={styles.mapTitleRow}>
                  <Icon name="map-outline" size={18} color={themeColor} />
                  <Text style={[styles.mapTitle, { color: themeColor }]}>Karte</Text>
                </View>
                {mapReady && (
                  <View style={styles.mapHeaderActions}>
                    <TouchableOpacity onPress={handleExportToMaps} style={styles.mapActionBtn}>
                      <Icon name="download-outline" size={18} color={themeColor} />
                    </TouchableOpacity>
                    {editable && (
                      <TouchableOpacity onPress={() => setShowMapSearch(s => !s)} style={styles.mapActionBtn}>
                        <Icon name="search-outline" size={18} color={themeColor} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => setMapFullscreen(true)} style={styles.mapActionBtn}>
                      <Icon name="expand-outline" size={18} color={themeColor} />
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
              <View style={{ flex: 1, position: 'relative', minHeight: 200 }}>
                {!mapReady && (
                  <View style={styles.mapPlaceholder}>
                    <Icon name="map-outline" size={32} color={colors.textLight} />
                    <Text style={styles.mapPlaceholderText}>Karte wird geladen...</Text>
                  </View>
                )}
                <div ref={mapRef} style={{ width: '100%', height: '100%', borderRadius: 12 }} />
              </View>
            </Card>
          )}

          {!mapFullscreen && (
            <Card style={[styles.notesCard, { backgroundColor: themeTint }]}>
              <Text style={styles.notesTitle}>Notizen</Text>
              <Text style={styles.notesText}>{linkifyText(trip.notes)}</Text>
            </Card>
          )}
        </ScrollView>
        ) : (
        <View style={styles.content}>
          {/* Stats */}
          <View style={[styles.statsRow, { backgroundColor: themeTint }]}>
            <TouchableOpacity style={styles.stat} onPress={() => navigation.replace('Itinerary', { tripId })} activeOpacity={0.7}>
              <Text style={[styles.statValue, { color: themeColor }]}>{days}</Text>
              <Text style={styles.statLabel}>Tage</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stat} onPress={() => navigation.replace('Itinerary', { tripId })} activeOpacity={0.7}>
              <Text style={[styles.statValue, { color: themeColor }]}>{activityCount}</Text>
              <Text style={styles.statLabel}>Aktivitäten</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stat} onPress={() => navigation.replace('Budget', { tripId })} activeOpacity={0.7}>
              <Text style={[styles.statValue, { color: themeColor }]}>{totalSpent.toFixed(0)}</Text>
              <Text style={styles.statLabel}>{trip.currency}</Text>
            </TouchableOpacity>
          </View>

          {/* Photos + Fable Grid */}
          <View style={styles.gridRow}>
            <TouchableOpacity
              style={[styles.gridCard, { backgroundColor: themeTint }]}
              onPress={() => navigation.navigate('Photos', { tripId })}
              activeOpacity={0.7}
            >
              <Icon name="images" size={22} color={colors.primary} />
              <Text style={[styles.gridCardTitle, { color: themeColor }]}>Fotos</Text>
              {photoCount > 0 && <Text style={[styles.gridCardInfo, { color: themeColor }]}>{photoCount}</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.gridCard, { backgroundColor: themeTint }]}
              onPress={() => setShowAiModal(true)}
              activeOpacity={0.7}
            >
              <Icon name="sparkles" size={22} color={colors.accent} />
              <Text style={[styles.gridCardTitle, { color: colors.accent }]}>Fable</Text>
              <Text style={[styles.gridCardInfo, { color: colors.accent }]}>
                {isPremium ? 'Inklusive' : aiCredits > 0 ? `${aiCredits} Inspirationen` : 'Reisebegleiter'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Post-Trip Recap */}
          {trip.status === 'completed' && (
            <TripRecapCard trip={trip} activityCount={activityCount} totalSpent={totalSpent} />
          )}

          {/* Map — fills remaining space */}
          {Platform.OS === 'web' && (
            <Card style={[styles.mapCard, { flex: 1, backgroundColor: themeTint }]}>
              <View style={styles.mapHeader}>
                <View style={styles.mapTitleRow}>
                  <Icon name="map-outline" size={18} color={themeColor} />
                  <Text style={[styles.mapTitle, { color: themeColor }]}>Karte</Text>
                </View>
                {mapReady && (
                  <View style={styles.mapHeaderActions}>
                    <TouchableOpacity onPress={handleExportToMaps} style={styles.mapActionBtn}>
                      <Icon name="download-outline" size={18} color={themeColor} />
                    </TouchableOpacity>
                    {editable && (
                      <TouchableOpacity onPress={() => setShowMapSearch(s => !s)} style={styles.mapActionBtn}>
                        <Icon name="search-outline" size={18} color={themeColor} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => setMapFullscreen(true)} style={styles.mapActionBtn}>
                      <Icon name="expand-outline" size={18} color={themeColor} />
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
              <View style={{ flex: 1, position: 'relative', minHeight: 200 }}>
                {!mapReady && (
                  <View style={styles.mapPlaceholder}>
                    <Icon name="map-outline" size={32} color={colors.textLight} />
                    <Text style={styles.mapPlaceholderText}>Karte wird geladen...</Text>
                  </View>
                )}
                <div ref={mapRef} style={{ width: '100%', height: '100%', borderRadius: 12 }} />
              </View>
            </Card>
          )}
        </View>
        )}
      </View>

      <TripBottomNav tripId={tripId} activeTab="TripDetail" />

      {Platform.OS === 'web' && mapFullscreen && (
        <>
          <TouchableOpacity
            onPress={() => setMapFullscreen(false)}
            style={[styles.fullscreenCloseBtn, { top: insets.top + spacing.sm }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon name="chevron-back" size={18} color={colors.primary} /><Text style={styles.fullscreenCloseText}>Schliessen</Text></View>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon name="share-outline" size={16} color={colors.primary} /><Text style={styles.fullscreenExportText}>KML</Text></View>
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

      <ChangeLog tripId={tripId} visible={showChangeLog} onClose={() => setShowChangeLog(false)} />

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

      <Modal visible={showMenu} transparent animationType="none" onRequestClose={() => setShowMenu(false)}>
        <TouchableOpacity style={styles.menuOverlay} onPress={() => setShowMenu(false)} activeOpacity={1}>
          <View style={[styles.menuDropdown, menuPos && { ...(menuPos.top != null ? { top: menuPos.top } : { bottom: menuPos.bottom }), right: menuPos.right }]}>
            {editable && (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); navigation.navigate('EditTrip', { tripId }); }}>
                  <Icon name="create-outline" size={18} color={colors.text} />
                  <Text style={styles.menuLabel}>Bearbeiten</Text>
                </TouchableOpacity>
                <View style={styles.menuDivider} />
              </>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setShowShareModal(true); }}>
              <Icon name="share-outline" size={18} color={colors.text} />
              <Text style={styles.menuLabel}>Teilen & Drucken</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setShowChangeLog(true); }}>
              <Icon name="time-outline" size={18} color={colors.text} />
              <Text style={styles.menuLabel}>Verlauf</Text>
            </TouchableOpacity>
            {editable && (
              <>
                <View style={styles.menuDivider} />
                <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setShowClearModal(true); }}>
                  <Icon name="trash-outline" size={18} color={colors.error} />
                  <Text style={[styles.menuLabel, { color: colors.error }]}>Reise leeren</Text>
                </TouchableOpacity>
              </>
            )}
            {!editable && (
              <>
                <View style={styles.menuDivider} />
                <View style={[styles.menuItem, { opacity: 0.5 }]}>
                  <Icon name="lock-closed-outline" size={18} color={colors.textSecondary} />
                  <Text style={[styles.menuLabel, { color: colors.textSecondary }]}>Nur lesen (Premium für mehr)</Text>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  dashboardLayout: { flex: 1 },
  scroll: { flex: 1 },
  header: { padding: spacing.xl, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  backBtn: {},
  backText: { color: '#FFFFFF' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderRadius: 16, overflow: 'hidden' },
  avatarOverflow: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  avatarOverflowText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  menuBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  menuText: { color: '#FFFFFF' },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)' },
  menuDropdown: { position: 'absolute', backgroundColor: colors.card, borderRadius: borderRadius.md, ...shadows.lg, minWidth: 190, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  menuLabel: { ...typography.body, fontWeight: '500', marginLeft: spacing.sm },
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  tripNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs, flexWrap: 'wrap' },
  erlebtBadge: { backgroundColor: '#D4A017', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  erlebtBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  tripName: { ...typography.h1, color: '#FFFFFF', ...(Platform.OS === 'web' ? { textShadow: '0px 1px 4px rgba(0,0,0,0.5)' } : { textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }) },
  destination: { ...typography.body, color: 'rgba(255,255,255,0.95)', marginBottom: spacing.xs, ...(Platform.OS === 'web' ? { textShadow: '0px 1px 3px rgba(0,0,0,0.5)' } : { textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }) },
  dates: { ...typography.bodySmall, color: 'rgba(255,255,255,0.9)', ...(Platform.OS === 'web' ? { textShadow: '0px 1px 3px rgba(0,0,0,0.5)' } : { textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }) },
  attribution: { ...typography.caption, fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: spacing.xs },
  attributionLink: { textDecorationLine: 'underline' },
  content: { flex: 1, padding: spacing.md, marginTop: -spacing.lg },
  statsRow: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.md, ...shadows.md, marginBottom: spacing.lg },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { ...typography.h2 },
  statLabel: { ...typography.caption, marginTop: 2 },
  gridRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  gridCard: { flex: 1, backgroundColor: colors.card, borderRadius: borderRadius.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 48, ...shadows.sm },
  gridCardIcon: {},
  gridCardTitle: { ...typography.body, fontWeight: '600' },
  gridCardInfo: { ...typography.caption, color: colors.textLight },
  mapCard: { marginBottom: spacing.lg, overflow: 'hidden' },
  mapHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  mapTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  mapTitle: { ...typography.h3 },
  mapHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  mapActionBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  mapPlaceholder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, zIndex: 1, backgroundColor: colors.background },
  mapPlaceholderText: { ...typography.bodySmall, color: colors.textLight },
  fullscreenBtn: { padding: spacing.xs },
  fullscreenBtnText: { color: colors.primary },
  mapSearchOverlay: { marginBottom: spacing.sm, zIndex: 100 },
  fullscreenCloseBtn: { position: 'fixed' as any, left: spacing.md, zIndex: 10000, backgroundColor: colors.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.lg, ...shadows.md },
  fullscreenCloseText: { ...typography.body, fontWeight: '600' as const, color: colors.primary },
  fullscreenSearchBar: { position: 'fixed' as any, left: 140, right: 100, zIndex: 10000 },
  fullscreenExportBtn: { position: 'fixed' as any, right: spacing.md, zIndex: 10000, backgroundColor: colors.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.lg, ...shadows.md },
  fullscreenExportText: { ...typography.bodySmall, fontWeight: '600' as const, color: colors.primary },
  notesCard: { marginBottom: spacing.lg },
  notesTitle: { ...typography.h3, marginBottom: spacing.sm },
  notesText: { ...typography.body, color: colors.textSecondary },
});
