import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Header, Card, EmptyState, TripBottomNav, ActivityModal, ActivityViewModal } from '../../components/common';
import type { ActivityFormData } from '../../components/common';
import { getActivitiesForTrip, getDays, createActivity, updateActivity, deleteActivity } from '../../api/itineraries';
import { getTrip } from '../../api/trips';
import { getDirections, formatDuration, formatDistance, TRAVEL_MODES, TravelMode, DirectionsResult } from '../../services/directions';
import { BOTTOM_NAV_HEIGHT } from '../../components/common/TripBottomNav';
import { Activity, Trip, ItineraryDay } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { ACTIVITY_CATEGORIES } from '../../utils/constants';
import { Icon, getActivityIconName } from '../../utils/icons';
import { getToday } from '../../utils/dateHelpers';
import { CATEGORY_COLORS, formatCategoryDetail } from '../../utils/categoryFields';
import { openGoogleMapsDirections } from '../../utils/openInMaps';
import { MapsAppPicker, tryOpenMapsDirectly } from '../../components/map/MapsAppPicker';
import { colors, spacing, borderRadius, typography, shadows, iconSize } from '../../utils/theme';
import { linkifyText } from '../../utils/linkify';
import { useToast } from '../../contexts/ToastContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useAuthContext } from '../../contexts/AuthContext';
import { UpgradePrompt } from '../../components/common/UpgradePrompt';
import { SneakPeekOverlay } from '../../components/common/SneakPeekOverlay';
import { StopsSkeleton } from '../../components/skeletons/StopsSkeleton';
import { RouteMapModal } from '../../components/map/RouteMapModal';
import { AiTripModal } from '../../components/ai/AiTripModal';
import { usePresence } from '../../hooks/usePresence';
import { logError } from '../../services/errorLogger';

type Props = NativeStackScreenProps<RootStackParamList, 'Stops'>;

interface CachedTravel {
  duration: number;
  distance: number;
  mode: TravelMode;
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
}

export const StopsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const { isFeatureAllowed, isSneakPeek, isPremium } = useSubscription();
  const { user, profile } = useAuthContext();
  usePresence(tripId, 'Stopps');
  const [showAiModal, setShowAiModal] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [transportActivities, setTransportActivities] = useState<Activity[]>([]);
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [travelInfo, setTravelInfo] = useState<Map<string, DirectionsResult>>(new Map());
  const [calculating, setCalculating] = useState<Set<string>>(new Set());

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [viewActivity, setViewActivity] = useState<Activity | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [addTransportDefaults, setAddTransportDefaults] = useState<Record<string, any> | null>(null);
  const loadIdRef = useRef(0); // Cancellation token for concurrent loadData calls

  // Travel mode picker & route menu
  const [showTravelModePicker, setShowTravelModePicker] = useState<string | null>(null);
  const [showRouteMenu, setShowRouteMenu] = useState<string | null>(null);
  const { showToast } = useToast();
  const today = getToday();
  const [showMapsPicker, setShowMapsPicker] = useState(false);
  const [mapsTarget, setMapsTarget] = useState<{ lat: number; lng: number; label?: string; context?: string } | null>(null);

  const openMapsForActivity = (activity: Activity) => {
    if (!activity.location_lat || !activity.location_lng) return;
    const opened = tryOpenMapsDirectly(
      activity.location_lat, activity.location_lng,
      activity.location_name || undefined, activity.location_address || undefined,
      profile?.preferred_maps_app,
    );
    if (!opened) {
      setMapsTarget({ lat: activity.location_lat, lng: activity.location_lng, label: activity.location_name || undefined, context: activity.location_address || undefined });
      setShowMapsPicker(true);
    }
  };

  // Extract the primary date from category data for day mapping & sorting
  const getActivityDate = (category: string, catData: Record<string, any>): string | undefined => {
    switch (category) {
      case 'hotel': return catData.check_in_date;
      case 'transport': return catData.departure_date;
      case 'stop': return catData.date;
      default: return catData.date;
    }
  };

  // Extract time for intra-day sorting (HH:MM format or empty)
  const getActivityTime = (activity: Activity): string => {
    const cd = activity.category_data || {};
    if (activity.category === 'hotel') return cd.check_in_time || '23:59'; // Hotels always last within a day
    if (activity.category === 'transport') return cd.departure_time || '';
    return activity.start_time || cd.time || '';
  };

  // Sort priority within the same day: stops/transport first, hotels last
  const getCategorySortWeight = (category: string): number => {
    return category === 'hotel' ? 1 : 0;
  };

  // Transport type → icon: use centralized getActivityIconName from icons.tsx

  /** Set of transport IDs already matched to a slot (prevents showing same transport twice) */
  const usedTransportIds = useRef(new Set<string>());

  /** Find ALL matching transport activities between two adjacent stops */
  const findTransportsBetween = (prevStop: Activity, nextStop: Activity): Activity[] => {
    const prevDate = getActivityDate(prevStop.category, prevStop.category_data || {}) || '';
    // For hotels, use check_out_date as effective departure from prev stop
    const effectivePrevDate = prevStop.category === 'hotel'
      ? (prevStop.category_data?.check_out_date || prevDate)
      : prevDate;
    const nextDate = getActivityDate(nextStop.category, nextStop.category_data || {}) || '9999-12-31';
    const results: Activity[] = [];
    for (const t of transportActivities) {
      if (usedTransportIds.current.has(t.id)) continue;
      const tDate = t.category_data?.departure_date;
      if (!tDate) continue;
      // Transport departure falls after prev stop ends and up to next stop start
      if (tDate >= effectivePrevDate && tDate <= nextDate) {
        usedTransportIds.current.add(t.id);
        results.push(t);
      }
    }
    return results;
  };

  /** Find all transports arriving at/before the first stop (Anreise) */
  const findArrivalTransports = (firstStop: Activity): Activity[] => {
    const firstDate = getActivityDate(firstStop.category, firstStop.category_data || {}) || '9999-12-31';
    const results: Activity[] = [];
    for (const t of transportActivities) {
      if (usedTransportIds.current.has(t.id)) continue;
      const tDate = t.category_data?.departure_date;
      if (!tDate) continue;
      // Transport on same day or before first stop = arrival transport
      if (tDate <= firstDate) {
        usedTransportIds.current.add(t.id);
        results.push(t);
      }
    }
    return results;
  };

  /** Find all transports departing on/after the last stop (Abreise) */
  const findDepartureTransports = (lastStop: Activity): Activity[] => {
    const lastDate = getActivityDate(lastStop.category, lastStop.category_data || {}) || '';
    const effectiveDate = lastStop.category === 'hotel'
      ? (lastStop.category_data?.check_out_date || lastDate)
      : lastDate;
    const results: Activity[] = [];
    for (const t of transportActivities) {
      if (usedTransportIds.current.has(t.id)) continue;
      const tDate = t.category_data?.departure_date;
      if (!tDate) continue;
      if (tDate >= effectiveDate) {
        usedTransportIds.current.add(t.id);
        results.push(t);
      }
    }
    return results;
  };

  const isActivityToday = (activity: Activity): boolean => {
    if (activity.category === 'hotel') {
      const ci = activity.category_data?.check_in_date;
      const co = activity.category_data?.check_out_date;
      return !!(ci && co && today >= ci && today <= co);
    }
    return getActivityDate(activity.category, activity.category_data || {}) === today;
  };

  // Resolve the correct day_id for a given date string
  const getDayIdForDate = (date: string | undefined): string | null => {
    if (!date) return null;
    const day = days.find(d => d.date === date);
    return day?.id || null;
  };

  const loadData = useCallback(async () => {
    const thisLoadId = ++loadIdRef.current; // Cancel previous concurrent calls
    try {
      const [t, acts, fetchedDays] = await Promise.all([
        getTrip(tripId),
        getActivitiesForTrip(tripId),
        getDays(tripId),
      ]);
      if (loadIdRef.current !== thisLoadId) return; // Cancelled

      setTrip(t);
      setDays(fetchedDays);

      // Separate stops (hotel/stop) and transport activities
      // Sort: 1) by date, 2) hotels last within same day, 3) by time
      const filtered = acts
        .filter(a => a.category === 'hotel' || a.category === 'stop')
        .sort((a, b) => {
          const dateA = getActivityDate(a.category, a.category_data || {}) || '9999-12-31';
          const dateB = getActivityDate(b.category, b.category_data || {}) || '9999-12-31';
          if (dateA !== dateB) return dateA.localeCompare(dateB);
          const weightA = getCategorySortWeight(a.category);
          const weightB = getCategorySortWeight(b.category);
          if (weightA !== weightB) return weightA - weightB;
          const timeA = getActivityTime(a);
          const timeB = getActivityTime(b);
          return timeA.localeCompare(timeB);
        });
      setActivities(filtered);

      // Extract transport activities for connection badges
      const transports = acts
        .filter(a => a.category === 'transport')
        .sort((a, b) => {
          const dateA = a.category_data?.departure_date || '9999-12-31';
          const dateB = b.category_data?.departure_date || '9999-12-31';
          if (dateA !== dateB) return dateA.localeCompare(dateB);
          const timeA = a.category_data?.departure_time || '';
          const timeB = b.category_data?.departure_time || '';
          return timeA.localeCompare(timeB);
        });
      setTransportActivities(transports);

      // Load cached travel info from category_data
      const initialTravel = new Map<string, DirectionsResult>();
      const needsCalc: { actId: string; prev: Activity; curr: Activity }[] = [];

      for (let i = 1; i < filtered.length; i++) {
        const prev = filtered[i - 1];
        const curr = filtered[i];
        if (!prev.location_lat || !prev.location_lng || !curr.location_lat || !curr.location_lng) continue;

        const cd = curr.category_data || {};
        const c: CachedTravel | undefined = cd.travel_from_prev;

        if (c && c.origin_lat === prev.location_lat && c.origin_lng === prev.location_lng
          && c.dest_lat === curr.location_lat && c.dest_lng === curr.location_lng) {
          initialTravel.set(curr.id, { duration: c.duration, distance: c.distance, mode: c.mode });
        } else {
          needsCalc.push({ actId: curr.id, prev, curr });
        }
      }
      setTravelInfo(initialTravel);

      // Calculate missing routes in background
      if (needsCalc.length > 0) {
        setCalculating(new Set(needsCalc.map(n => n.actId)));
        for (const { actId, prev: prevStop, curr } of needsCalc) {
          if (loadIdRef.current !== thisLoadId) return; // Cancelled
          const mode: TravelMode = curr.category_data?.travel_from_prev?.mode || 'driving';
          const result = await getDirections(
            { lat: prevStop.location_lat!, lng: prevStop.location_lng! },
            { lat: curr.location_lat!, lng: curr.location_lng! },
            mode,
          );
          if (loadIdRef.current !== thisLoadId) return; // Cancelled
          if (result) {
            setTravelInfo(prevMap => {
              const next = new Map(prevMap);
              next.set(actId, result);
              return next;
            });
            // Persist to DB
            const cacheData: CachedTravel = {
              duration: result.duration,
              distance: result.distance,
              mode: result.mode,
              origin_lat: prevStop.location_lat!,
              origin_lng: prevStop.location_lng!,
              dest_lat: curr.location_lat!,
              dest_lng: curr.location_lng!,
            };
            updateActivity(actId, {
              category_data: { ...curr.category_data, travel_from_prev: cacheData },
            }).catch(() => {});
          }
          setCalculating(prevCalc => {
            const next = new Set(prevCalc);
            next.delete(actId);
            return next;
          });
        }
      }
    } catch (e) {
      logError(e, { component: 'StopsScreen', context: { action: 'loadData' } });
      console.error(e);
    } finally {
      if (loadIdRef.current === thisLoadId) setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { loadData(); }, [loadData]);

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

  const getTravelIconName = (mode: TravelMode): string => TRAVEL_MODES.find(m => m.id === mode)?.icon || 'car-outline';

  const handleChangeTravelMode = async (activityId: string, newMode: TravelMode) => {
    setShowTravelModePicker(null);
    const idx = activities.findIndex(a => a.id === activityId);
    if (idx < 1) return;

    const prev = activities[idx - 1];
    const curr = activities[idx];
    if (!prev.location_lat || !prev.location_lng || !curr.location_lat || !curr.location_lng) return;

    // Mark as calculating
    setCalculating(p => new Set(p).add(activityId));

    const result = await getDirections(
      { lat: prev.location_lat, lng: prev.location_lng },
      { lat: curr.location_lat, lng: curr.location_lng },
      newMode,
    );

    if (result) {
      setTravelInfo(prevMap => {
        const next = new Map(prevMap);
        next.set(activityId, result);
        return next;
      });
      // Persist
      const cacheData: CachedTravel = {
        duration: result.duration,
        distance: result.distance,
        mode: result.mode,
        origin_lat: prev.location_lat!,
        origin_lng: prev.location_lng!,
        dest_lat: curr.location_lat!,
        dest_lng: curr.location_lng!,
      };
      await updateActivity(activityId, {
        category_data: { ...curr.category_data, travel_from_prev: cacheData },
      }).catch(() => {});
    }

    setCalculating(p => {
      const next = new Set(p);
      next.delete(activityId);
      return next;
    });
  };

  const openAddModal = () => {
    setEditingActivity(null);
    setShowModal(true);
  };

  const openEditModal = (activity: Activity) => {
    setEditingActivity(activity);
    setShowModal(true);
  };

  const handleModalSave = async (data: ActivityFormData) => {
    const actDate = getActivityDate(data.category, data.categoryData);
    const resolvedDayId = getDayIdForDate(actDate) || (days.length > 0 ? days[0].id : '');
    if (!data.title || !resolvedDayId) return;
    try {
      const payload = {
        day_id: resolvedDayId,
        title: data.title,
        description: data.notes || null,
        category: data.category,
        start_time: data.startTime || null,
        location_name: data.locationName || null,
        location_lat: data.locationLat,
        location_lng: data.locationLng,
        location_address: data.locationAddress,
        check_in_date: data.categoryData.check_in_date || null,
        check_out_date: data.categoryData.check_out_date || null,
        category_data: data.categoryData,
      };

      if (editingActivity) {
        const locChanged = editingActivity.location_lat !== data.locationLat || editingActivity.location_lng !== data.locationLng;
        if (locChanged) {
          const cleanData = { ...data.categoryData };
          delete cleanData.travel_from_prev;
          payload.category_data = cleanData;
        }
        await updateActivity(editingActivity.id, payload);

        if (locChanged) {
          const idx = activities.findIndex(a => a.id === editingActivity.id);
          if (idx >= 0 && idx < activities.length - 1) {
            const next = activities[idx + 1];
            const nextData = { ...(next.category_data || {}) };
            delete nextData.travel_from_prev;
            await updateActivity(next.id, { category_data: nextData }).catch(() => {});
          }
        }
      } else {
        await createActivity({
          ...payload,
          trip_id: tripId,
          end_time: null,
          cost: null,
          currency: 'CHF',
          sort_order: activities.length,
        });
      }
      setShowModal(false);
      setEditingActivity(null);
      await loadData();
    } catch (e) {
      logError(e, { component: 'StopsScreen', context: { action: 'handleModalSave' } });
      Alert.alert('Fehler', editingActivity ? 'Änderung fehlgeschlagen' : 'Aktivität konnte nicht erstellt werden');
    }
  };

  const handleDelete = async (id: string) => {
    const doDelete = async () => {
      // Optimistic: remove from UI immediately
      const prevActivities = [...activities];
      setActivities(prev => prev.filter(a => a.id !== id));
      try {
        // Clear next activity's cache
        const idx = prevActivities.findIndex(a => a.id === id);
        if (idx >= 0 && idx < prevActivities.length - 1) {
          const next = prevActivities[idx + 1];
          const nextData = { ...(next.category_data || {}) };
          delete nextData.travel_from_prev;
          await updateActivity(next.id, { category_data: nextData }).catch(() => {});
        }
        await deleteActivity(id);
        showToast('Eintrag gelöscht', 'success');
        await loadData();
      } catch (e: any) {
        logError(e, { severity: 'critical', component: 'StopsScreen', context: { action: 'handleDelete' } });
        showToast('Fehler beim Löschen', 'error');
        setActivities(prevActivities);
      }
    };

    if (Platform.OS === 'web') {
      if (!window.confirm('Eintrag wirklich löschen?')) return;
      await doDelete();
    } else {
      Alert.alert('Löschen', 'Eintrag wirklich löschen?', [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Löschen', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  // Find the day route (hotel→stops→hotel) for a given travel segment index
  const getDayRoute = (index: number): { origin: Activity; destination: Activity; waypoints: Activity[] } | null => {
    // Search backwards for the start hotel (the stop before index)
    let startIdx = -1;
    for (let j = index - 1; j >= 0; j--) {
      if (activities[j].category === 'hotel') { startIdx = j; break; }
    }
    // Search forwards for the end hotel (at index or later)
    let endIdx = -1;
    for (let j = index; j < activities.length; j++) {
      if (activities[j].category === 'hotel') { endIdx = j; break; }
    }
    if (startIdx === -1 || endIdx === -1 || startIdx === endIdx) return null;
    const origin = activities[startIdx];
    const destination = activities[endIdx];
    if (!origin.location_lat || !origin.location_lng || !destination.location_lat || !destination.location_lng) return null;
    const waypoints = activities.slice(startIdx + 1, endIdx).filter(a => a.location_lat && a.location_lng);
    return { origin, destination, waypoints };
  };

  // Free user on shared trip → can see but not edit
  const isSharedReadonly = !isPremium && !!trip && trip.owner_id !== user?.id;
  const stopsSneakPeek = isSneakPeek('stops', activities.length > 0);
  const readonlyMode = stopsSneakPeek || isSharedReadonly;

  if (!isFeatureAllowed('stops') && !stopsSneakPeek && !isSharedReadonly) {
    return (
      <View style={styles.container}>
        <Header title="Route & Stops" onBack={() => navigation.navigate('Main' as any, { screen: 'Home' })} />
        <UpgradePrompt
          iconName="map-outline"
          title="Routen & Stops"
          message="Plane deine Route visuell — von Hotel zu Hotel, mit allen Zwischenstopps"
          heroGradient={['#6C5CE7', '#74B9FF']}
          trigger="stops_feature"
          highlights={[
            { icon: 'bed-outline', text: 'Hotels & Übernachtungen', detail: 'Check-in/out Daten, Buchungslinks & Notizen' },
            { icon: 'navigate-outline', text: 'Zwischenstopps planen', detail: 'Sehenswürdigkeiten, Restaurants & Tankstellen' },
            { icon: 'car-outline', text: 'Route berechnen', detail: 'Fahrtzeiten & Distanzen zwischen allen Stops' },
            { icon: 'map-outline', text: 'Gesamtroute auf der Karte', detail: 'Alle Stops verbunden auf einer interaktiven Karte' },
          ]}
        />
        <TripBottomNav tripId={tripId} activeTab="Stops" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Route & Stops"
        rightAction={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity onPress={() => setShowAiModal(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="sparkles-outline" size={iconSize.md} color={colors.secondary} />
            </TouchableOpacity>
            {activities.length >= 2 && (
              <TouchableOpacity onPress={() => setShowMapModal(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="map-outline" size={iconSize.md} color={colors.accent} />
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {readonlyMode && <SneakPeekOverlay feature="Stops" />}

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardDismissMode="on-drag" onScrollBeginDrag={() => { setShowTravelModePicker(null); setShowRouteMenu(null); }}>
        {loading ? (
          <StopsSkeleton />
        ) : activities.length === 0 ? (
          <EmptyState
            iconName="map-outline"
            title="Keine Stops geplant"
            message="Füge Übernachtungen und Zwischenstopps hinzu"
            actionLabel={readonlyMode ? undefined : "Stop hinzufügen"}
            onAction={readonlyMode ? undefined : openAddModal}
          />
        ) : (() => {
          // Reset used transport IDs for each render pass
          usedTransportIds.current = new Set();

          // Pre-compute arrival transports (before first stop) — e.g. multi-leg flights, airport transfer
          const arrivalTransports = activities.length > 0 ? findArrivalTransports(activities[0]) : [];
          // Pre-compute departure transports (after last stop)
          const departureTransports = activities.length > 0 ? findDepartureTransports(activities[activities.length - 1]) : [];

          /** Render a transport badge card */
          const renderTransportBadge = (t: Activity) => (
            <TouchableOpacity
              key={t.id}
              style={styles.transportBadge}
              onPress={() => setViewActivity(t)}
              activeOpacity={0.7}
            >
              <Icon
                name={getActivityIconName('transport', t.category_data)}
                size={16}
                color={CATEGORY_COLORS.transport}
              />
              <View style={styles.transportBadgeContent}>
                <Text style={styles.transportBadgeTitle} numberOfLines={1}>{t.title}</Text>
                {(() => {
                  const detail = formatCategoryDetail('transport', t.category_data || {});
                  return detail ? <Text style={styles.transportBadgeDetail} numberOfLines={1}>{detail}</Text> : null;
                })()}
              </View>
              <Icon name="chevron-forward" size={14} color={CATEGORY_COLORS.transport} />
            </TouchableOpacity>
          );

          return <>
          {/* Arrival transports before first stop (Anreise — multi-leg, airport transfer, etc.) */}
          {arrivalTransports.length > 0 && (
            <View style={styles.travelSection}>
              {arrivalTransports.map(renderTransportBadge)}
            </View>
          )}

          {activities.map((activity, i) => {
            // Find ALL transport activities connecting this stop to the previous one
            const matchingTransports = i > 0 ? findTransportsBetween(activities[i - 1], activity) : [];

            return (
            <View key={activity.id}>
              {i > 0 && (
                <View style={styles.travelSection}>
                  {matchingTransports.length > 0 ? (
                    // --- Transport activity badges (multi-transport support) ---
                    matchingTransports.map(renderTransportBadge)
                  ) : activity.location_lat && activities[i - 1].location_lat ? (
                    // --- Google Directions fallback (existing behavior) ---
                    <>
                      {calculating.has(activity.id) ? (
                        <View style={styles.travelBadge}>
                          <Icon name="hourglass-outline" size={14} color={colors.sky} />
                          <Text style={styles.travelText}>Berechne...</Text>
                        </View>
                      ) : travelInfo.has(activity.id) ? (
                        <View style={styles.travelBadgeRow}>
                          <TouchableOpacity
                            style={styles.travelBadge}
                            onPress={() => {
                              setShowRouteMenu(null);
                              setShowTravelModePicker(
                                showTravelModePicker === activity.id ? null : activity.id
                              );
                            }}
                            activeOpacity={0.7}
                          >
                            <Icon name={getTravelIconName(travelInfo.get(activity.id)!.mode) as any} size={14} color={colors.sky} />
                            <Text style={styles.travelText}>
                              {formatDuration(travelInfo.get(activity.id)!.duration)} · {formatDistance(travelInfo.get(activity.id)!.distance)}
                            </Text>
                            <View style={{ marginLeft: spacing.xs }}><Icon name="chevron-down" size={12} color={colors.sky} /></View>
                          </TouchableOpacity>
                          {/* Quick-add transport button */}
                          {!readonlyMode && (
                            <TouchableOpacity
                              style={styles.quickAddTransport}
                              onPress={() => {
                                const prev = activities[i - 1];
                                const mode = travelInfo.get(activity.id)?.mode || 'driving';
                                const transportType = mode === 'transit' ? 'Zug' : mode === 'walking' ? 'Zu Fuss' : mode === 'bicycling' ? 'Velo' : 'Auto';
                                const prevDate = getActivityDate(prev.category, prev.category_data || {});
                                setAddTransportDefaults({
                                  transport_type: transportType === 'Zu Fuss' || transportType === 'Velo' ? 'Auto' : transportType,
                                  departure_station_name: prev.location_name || prev.location_address || '',
                                  departure_station_lat: prev.location_lat,
                                  departure_station_lng: prev.location_lng,
                                  arrival_station_name: activity.location_name || activity.location_address || '',
                                  arrival_station_lat: activity.location_lat,
                                  arrival_station_lng: activity.location_lng,
                                  departure_date: prevDate || '',
                                });
                                setEditingActivity(null);
                                setShowModal(true);
                              }}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Icon name="add-circle-outline" size={16} color={colors.sky} />
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            style={styles.routeMenuBtn}
                            onPress={() => {
                              setShowTravelModePicker(null);
                              setShowRouteMenu(showRouteMenu === activity.id ? null : activity.id);
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Icon name="ellipsis-vertical" size={16} color={colors.sky} />
                          </TouchableOpacity>
                        </View>
                      ) : null}

                      {showRouteMenu === activity.id && (() => {
                        const dayRoute = getDayRoute(i);
                        const mode = travelInfo.get(activity.id)?.mode || 'driving';
                        const prev = activities[i - 1];
                        return (
                          <View style={styles.routeMenuDropdown}>
                            <TouchableOpacity
                              style={[styles.routeMenuItem, !dayRoute && { opacity: 0.4 }]}
                              disabled={!dayRoute}
                              onPress={() => {
                                if (!dayRoute) return;
                                setShowRouteMenu(null);
                                openGoogleMapsDirections(
                                  { lat: dayRoute.origin.location_lat!, lng: dayRoute.origin.location_lng! },
                                  { lat: dayRoute.destination.location_lat!, lng: dayRoute.destination.location_lng! },
                                  dayRoute.waypoints.map(w => ({ lat: w.location_lat!, lng: w.location_lng! })),
                                  mode,
                                );
                              }}
                            >
                              <Icon name="map-outline" size={iconSize.sm} color={colors.accent} />
                              <Text style={styles.routeMenuLabel}>Gesamte Tagesroute</Text>
                            </TouchableOpacity>
                            <View style={styles.routeMenuDivider} />
                            <TouchableOpacity
                              style={styles.routeMenuItem}
                              onPress={() => {
                                setShowRouteMenu(null);
                                openGoogleMapsDirections(
                                  { lat: prev.location_lat!, lng: prev.location_lng! },
                                  { lat: activity.location_lat!, lng: activity.location_lng! },
                                  [],
                                  mode,
                                );
                              }}
                            >
                              <Icon name="navigate-outline" size={iconSize.sm} color={colors.secondary} />
                              <Text style={styles.routeMenuLabel}>Abschnitt öffnen</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })()}

                      {showTravelModePicker === activity.id && (
                        <View style={styles.travelModeRow}>
                          {TRAVEL_MODES.map(tm => {
                            const current = travelInfo.get(activity.id)?.mode || 'driving';
                            return (
                              <TouchableOpacity
                                key={tm.id}
                                style={[styles.travelModeChip, current === tm.id && styles.travelModeChipActive]}
                                onPress={() => handleChangeTravelMode(activity.id, tm.id)}
                              >
                                <Icon name={tm.icon as any} size={14} color={current === tm.id ? colors.sky : colors.textSecondary} />
                                <Text style={[styles.travelModeLabel, current === tm.id && styles.travelModeLabelActive]}>{tm.label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </>
                  ) : null}
                </View>
              )}

              <TouchableOpacity activeOpacity={0.7} onPress={() => setViewActivity(activity)}>
                <Card style={[styles.stopCard, isActivityToday(activity) && styles.stopCardToday]}>
                  <View style={styles.stopHeader}>
                    <View style={[styles.stopIcon, { backgroundColor: (CATEGORY_COLORS[activity.category] || colors.primary) + '15' }]}>
                      <Icon name={getActivityIconName(activity.category, activity.category_data)} size={iconSize.sm} color={CATEGORY_COLORS[activity.category] || colors.primary} />
                    </View>
                    <View style={styles.stopInfo}>
                      <Text style={styles.stopName}>{activity.title}</Text>
                      {(activity.location_name || activity.location_address) && (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={[styles.stopAddress, { flex: 1 }]} numberOfLines={1}>
                            {activity.location_name || activity.location_address}
                          </Text>
                          {activity.location_lat && activity.location_lng && (
                            <TouchableOpacity onPress={(e: any) => { e.stopPropagation(); openMapsForActivity(activity); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Icon name="open-outline" size={14} color={colors.secondary} />
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                      <View style={styles.stopMeta}>
                        {activity.start_time && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <Icon name="time-outline" size={12} color={colors.secondary} />
                            <Text style={styles.stopTime}>{activity.start_time}</Text>
                          </View>
                        )}
                        {(() => {
                          const detail = formatCategoryDetail(activity.category, activity.category_data || {});
                          return detail ? (
                            <Text style={[styles.stopDetail, { color: CATEGORY_COLORS[activity.category] || colors.primary }]}>{linkifyText(detail)}</Text>
                          ) : null;
                        })()}
                      </View>
                    </View>
                  </View>
                  <View style={styles.stopActions}>
                    <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleDelete(activity.id); }} style={styles.deleteBtn}>
                      <Icon name="trash-outline" size={iconSize.xs} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </Card>
              </TouchableOpacity>
            </View>
          );
          })}

          {/* Departure transports after last stop (Abreise — airport transfer, multi-leg, etc.) */}
          {departureTransports.length > 0 && (
            <View style={styles.travelSection}>
              {departureTransports.map(renderTransportBadge)}
            </View>
          )}
          </>;
        })()}
      </ScrollView>

      {!readonlyMode && (
        <TouchableOpacity style={styles.fab} onPress={openAddModal} activeOpacity={0.8}>
          <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.fabGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Icon name="add" size={28} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      )}

      <ActivityViewModal
        visible={!!viewActivity}
        activity={viewActivity}
        onClose={() => setViewActivity(null)}
        onEdit={readonlyMode ? () => { showToast('Upgrade auf Premium um zu bearbeiten', 'info'); } : (a) => { setViewActivity(null); openEditModal(a); }}
        onDelete={readonlyMode ? () => { showToast('Upgrade auf Premium um zu löschen', 'info'); } : (id) => { setViewActivity(null); handleDelete(id); }}
      />

      <ActivityModal
        visible={showModal}
        activity={editingActivity}
        onSave={(data) => { setAddTransportDefaults(null); handleModalSave(data); }}
        onCancel={() => { setShowModal(false); setEditingActivity(null); setAddTransportDefaults(null); }}
        tripStartDate={trip?.start_date}
        tripEndDate={trip?.end_date}
        categoryFilter={addTransportDefaults ? ['transport'] : ['hotel', 'stop']}
        defaultCategory={addTransportDefaults ? 'transport' : 'hotel'}
        defaultCategoryData={addTransportDefaults || undefined}
      />

      <RouteMapModal
        visible={showMapModal}
        onClose={() => setShowMapModal(false)}
        stops={activities}
        travelInfo={travelInfo}
        isRoundTrip={trip?.is_round_trip}
        transportActivities={transportActivities}
      />

      {showAiModal && user && (
        <AiTripModal
          visible={showAiModal}
          onClose={() => setShowAiModal(false)}
          mode="enhance"
          tripId={tripId}
          userId={user.id}
        />
      )}

      {mapsTarget && (
        <MapsAppPicker
          visible={showMapsPicker}
          lat={mapsTarget.lat}
          lng={mapsTarget.lng}
          label={mapsTarget.label}
          locationContext={mapsTarget.context}
          onClose={() => setShowMapsPicker(false)}
        />
      )}

      <TripBottomNav tripId={tripId} activeTab="Stops" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { flex: 1 },
  listContent: { padding: spacing.md, paddingBottom: 140 },
  travelSection: { alignItems: 'center', marginVertical: spacing.sm },
  travelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.sky + '20',
    borderRadius: borderRadius.full,
  },
  travelText: { ...typography.caption, color: colors.sky, fontWeight: '600', marginLeft: spacing.xs },
  travelBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  routeMenuBtn: { padding: 4 },
  routeMenuDropdown: {
    marginTop: spacing.xs,
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
    overflow: 'hidden',
  },
  routeMenuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  routeMenuLabel: { ...typography.bodySmall, fontWeight: '500' },
  routeMenuDivider: { height: 1, backgroundColor: colors.border },
  travelModeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  travelModeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  travelModeChipActive: {
    borderColor: colors.sky,
    backgroundColor: colors.sky + '20',
  },
  travelModeLabel: { ...typography.caption, fontSize: 11 },
  travelModeLabelActive: { color: colors.sky, fontWeight: '600' },
  stopCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stopCardToday: { borderLeftWidth: 3, borderLeftColor: colors.secondary, backgroundColor: colors.secondary + '08' },
  stopHeader: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  stopIcon: { width: 32, height: 32, borderRadius: 16, marginRight: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  stopInfo: { flex: 1 },
  stopName: { ...typography.body, fontWeight: '600' },
  stopAddress: { ...typography.caption, marginTop: 2 },
  stopMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  stopTime: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  stopDetail: { ...typography.caption, fontWeight: '600' },
  stopActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  deleteBtn: { padding: spacing.xs, marginLeft: spacing.xs },
  fab: { position: 'absolute', right: spacing.xl, bottom: BOTTOM_NAV_HEIGHT + spacing.md, width: 56, height: 56 },
  fabGradient: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', ...shadows.lg },
  // Transport connection badge
  transportBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CATEGORY_COLORS.transport + '12',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: CATEGORY_COLORS.transport + '30',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  transportBadgeContent: { flex: 1 },
  transportBadgeTitle: { ...typography.bodySmall, fontWeight: '600', color: CATEGORY_COLORS.transport },
  transportBadgeDetail: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  quickAddTransport: { padding: 4 },
});
