import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, PanResponder, Platform, RefreshControl } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Header, Card, TripBottomNav, ActivityModal, ActivityViewModal } from '../../components/common';
import type { ActivityFormData } from '../../components/common';
import { getDays, getActivities, getActivitiesForTrip, createDay, createActivity, updateActivity, deleteActivity } from '../../api/itineraries';
import { getPhotos } from '../../api/photos';
import { ItineraryDay, Activity } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { getDayDates, formatDateShort, formatTime, getToday } from '../../utils/dateHelpers';
import { getTrip } from '../../api/trips';
import { ACTIVITY_CATEGORIES } from '../../utils/constants';
import { Icon, getActivityIconName } from '../../utils/icons';
import { useRealtime } from '../../hooks/useRealtime';
import { formatCategoryDetail, CATEGORY_COLORS } from '../../utils/categoryFields';
import { openInGoogleMaps } from '../../utils/openInMaps';
import { colors, spacing, borderRadius, typography, shadows, iconSize } from '../../utils/theme';
import { linkifyText } from '../../utils/linkify';
import { useToast } from '../../contexts/ToastContext';
import { ItinerarySkeleton } from '../../components/skeletons/ItinerarySkeleton';
import { AiTripModal } from '../../components/ai/AiTripModal';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useAuthContext } from '../../contexts/AuthContext';
import { usePlanGeneration } from '../../contexts/PlanGenerationContext';
import { useWeather } from '../../hooks/useWeather';
import { useFlightStatus, getFlightStatusLabel, isVerifiedFlight } from '../../hooks/useFlightStatus';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { InlineEditText } from '../../components/common/InlineEditText';
import { ContextMenu, ContextMenuItem } from '../../components/common/ContextMenu';
import { NAV_ICONS, MISC_ICONS } from '../../utils/icons';
import { PollCard, CreatePollModal } from '../../components/common/PollCard';
import { getPolls, PollWithVotes } from '../../api/polls';
import { getReactionsByActivities } from '../../api/comments';
import { ActivityReaction } from '../../types/database';

type Props = NativeStackScreenProps<RootStackParamList, 'Itinerary'>;

export const ItineraryScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const { showToast } = useToast();
  const { user } = useAuthContext();
  const { isFeatureAllowed } = useSubscription();
  const { isGenerating: isPlanGenerating, tripId: generatingTripId } = usePlanGeneration();
  const isGeneratingThisTrip = isPlanGenerating && generatingTripId === tripId;
  const [showAiModal, setShowAiModal] = useState(false);
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [dayDates, setDayDates] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [modalActivity, setModalActivity] = useState<Activity | null>(null);
  const [modalDefaultCategoryData, setModalDefaultCategoryData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [hotelActivities, setHotelActivities] = useState<Activity[]>([]);
  const [allTripActivities, setAllTripActivities] = useState<Activity[]>([]);
  const [viewActivity, setViewActivity] = useState<Activity | null>(null);
  const [modalDefaultCategory, setModalDefaultCategory] = useState<string | undefined>(undefined);
  const [photoCounts, setPhotoCounts] = useState<Map<string, number>>(new Map());
  const [tripStartDate, setTripStartDate] = useState<string>('');
  const [tripEndDate, setTripEndDate] = useState<string>('');
  const [tripDestLat, setTripDestLat] = useState<number | null>(null);
  const [tripDestLng, setTripDestLng] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ activity: Activity; position: { x: number; y: number } } | null>(null);
  const [polls, setPolls] = useState<PollWithVotes[]>([]);
  const [showPollModal, setShowPollModal] = useState(false);
  const [reactionsMap, setReactionsMap] = useState<Record<string, ActivityReaction[]>>({});
  const tabScrollRef = useRef<ScrollView>(null);
  const tabWidths = useRef<number[]>([]);

  const weather = useWeather(tripId, tripStartDate, tripEndDate, tripDestLat, tripDestLng);

  // Only pass visible flights to useFlightStatus: current day + arrival/departure transports
  const visibleFlightActivities = useMemo(() => {
    if (!selectedDayId) return [];
    const selectedDay = days.find(d => d.id === selectedDayId);
    const selectedDate = selectedDay?.date;
    const isFirst = selectedDate === tripStartDate;
    const isLast = selectedDate === tripEndDate;
    const visible: Activity[] = [];
    // Current day's activities (flights)
    for (const act of activities) {
      if (act.category === 'transport' && act.category_data?.transport_type === 'Flug' && act.category_data?.flight_verified) {
        visible.push(act);
      }
    }
    // Arrival/departure transport from allTripActivities (shown on first/last day)
    if (isFirst || isLast) {
      for (const act of allTripActivities) {
        if (act.category !== 'transport' || act.category_data?.transport_type !== 'Flug' || !act.category_data?.flight_verified) continue;
        if (visible.some(v => v.id === act.id)) continue;
        if (isFirst && act.category_data?.is_arrival) visible.push(act);
        if (isLast && act.category_data?.is_departure) visible.push(act);
      }
    }
    return visible;
  }, [activities, allTripActivities, selectedDayId, days, tripStartDate, tripEndDate]);

  const flightStatuses = useFlightStatus(visibleFlightActivities, tripStartDate, tripEndDate);

  const scrollToActiveTab = useCallback((dayId: string) => {
    const idx = days.findIndex(d => d.id === dayId);
    if (idx < 0 || !tabScrollRef.current) return;
    // Estimate offset: each tab ~80px wide + 8px gap
    const estimatedWidth = 80;
    const gap = 8;
    const offset = Math.max(0, idx * (estimatedWidth + gap) - estimatedWidth);
    tabScrollRef.current.scrollTo({ x: offset, animated: true });
  }, [days]);

  // Task 6: Split loadData into loadTripData (once) and loadActivities (per day)
  const loadTripData = useCallback(async () => {
    try {
      const [trip, fetchedAllActivities, tripPhotos, tripPolls] = await Promise.all([getTrip(tripId), getActivitiesForTrip(tripId), getPhotos(tripId).catch(() => []), getPolls(tripId).catch(() => [])]);
      setPolls(tripPolls);
      setAllTripActivities(fetchedAllActivities);
      setHotelActivities(fetchedAllActivities.filter(a => a.category === 'hotel'));
      setTripStartDate(trip.start_date);
      setTripEndDate(trip.end_date);
      setTripDestLat(trip.destination_lat);
      setTripDestLng(trip.destination_lng);
      // Build photo counts per day
      const pCounts = new Map<string, number>();
      for (const p of tripPhotos) {
        if (p.day_id) pCounts.set(p.day_id, (pCounts.get(p.day_id) || 0) + 1);
      }
      setPhotoCounts(pCounts);
      const dates = getDayDates(trip.start_date, trip.end_date);
      setDayDates(dates);

      let existingDays = await getDays(tripId);

      // Create missing days
      for (const date of dates) {
        if (!existingDays.find(d => d.date === date)) {
          const day = await createDay(tripId, date);
          existingDays.push(day);
        }
      }
      existingDays.sort((a, b) => a.date.localeCompare(b.date));
      setDays(existingDays);

      if (!selectedDayId && existingDays.length > 0) {
        const today = getToday();
        const todayDay = existingDays.find(d => d.date === today);
        const targetDay = todayDay || existingDays[0];
        setSelectedDayId(targetDay.id);
        const acts = await getActivities(targetDay.id);
        setActivities(acts);
        if (todayDay) {
          const idx = existingDays.indexOf(todayDay);
          setTimeout(() => {
            if (tabScrollRef.current && idx > 0) {
              const offset = Math.max(0, idx * 88 - 80);
              tabScrollRef.current.scrollTo({ x: offset, animated: true });
            }
          }, 100);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  const loadDayActivities = useCallback(async (dayId: string) => {
    setSelectedDayId(dayId);
    scrollToActiveTab(dayId);
    const acts = await getActivities(dayId);
    setActivities(acts);
    // Load reactions for visible activities
    if (acts.length > 0) {
      getReactionsByActivities(acts.map(a => a.id)).then(setReactionsMap).catch(() => {});
    } else {
      setReactionsMap({});
    }
  }, [scrollToActiveTab]);

  useEffect(() => { loadTripData(); }, [loadTripData]);

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
  useRealtime('activities', `trip_id=eq.${tripId}`, () => {
    // Reload hotel activities + current day
    getActivitiesForTrip(tripId).then(all => {
      setAllTripActivities(all);
      setHotelActivities(all.filter(a => a.category === 'hotel'));
    });
    if (selectedDayId) loadDayActivities(selectedDayId);
  });

  // Resolve the correct day_id for a given date string
  const getDayIdForDate = (date: string | undefined): string | null => {
    if (!date) return null;
    const day = days.find(d => d.date === date);
    return day?.id || null;
  };

  // Extract the primary date from category data for day mapping
  const getActivityDate = (category: string, catData: Record<string, any>): string | undefined => {
    switch (category) {
      case 'hotel': return catData.check_in_date;
      case 'transport': return catData.departure_date;
      case 'stop': return catData.date;
      default: return catData.date;
    }
  };

  // Re-sort activities by start_time within a day and update sort_order in DB
  const resortActivitiesByTime = async (dayId: string) => {
    try {
      const acts = await getActivities(dayId);
      const sorted = [...acts].sort((a, b) => {
        if (!a.start_time && !b.start_time) return a.sort_order - b.sort_order;
        if (!a.start_time) return 1;
        if (!b.start_time) return -1;
        return a.start_time.localeCompare(b.start_time);
      });
      // Only update if order actually changed
      const needsUpdate = sorted.some((act, idx) => act.sort_order !== idx);
      if (needsUpdate) {
        await Promise.all(sorted.map((act, idx) =>
          act.sort_order !== idx ? updateActivity(act.id, { sort_order: idx }) : Promise.resolve(null),
        ));
      }
    } catch (e) {
      console.error('Failed to resort activities:', e);
    }
  };

  const handleModalSave = async (data: ActivityFormData) => {
    if (!data.title) return;
    try {
      const actDate = getActivityDate(data.category, data.categoryData);
      const targetDayId = getDayIdForDate(actDate) || selectedDayId;
      if (!targetDayId) return;

      if (modalActivity) {
        // Edit
        const newDayId = getDayIdForDate(actDate);
        await updateActivity(modalActivity.id, {
          title: data.title,
          category: data.category,
          start_time: data.startTime || null,
          description: data.notes || null,
          location_name: data.locationName || null,
          location_lat: data.locationLat,
          location_lng: data.locationLng,
          location_address: data.locationAddress,
          check_in_date: data.categoryData.check_in_date || null,
          check_out_date: data.categoryData.check_out_date || null,
          category_data: data.categoryData,
          ...(newDayId ? { day_id: newDayId } : {}),
        });
      } else {
        // Add
        await createActivity({
          day_id: targetDayId,
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
          currency: 'CHF',
          sort_order: activities.length,
          check_in_date: data.categoryData.check_in_date || null,
          check_out_date: data.categoryData.check_out_date || null,
          category_data: data.categoryData,
        });
      }
      // Re-sort by time if this activity has a start_time
      if (data.startTime && targetDayId) {
        await resortActivitiesByTime(targetDayId);
      }
      setShowModal(false);
      setModalActivity(null);
      const allActs = await getActivitiesForTrip(tripId);
      setAllTripActivities(allActs);
      setHotelActivities(allActs.filter(a => a.category === 'hotel'));
      if (selectedDayId) await loadDayActivities(selectedDayId);
    } catch (e) {
      Alert.alert('Fehler', modalActivity ? 'Aktivität konnte nicht aktualisiert werden' : 'Aktivität konnte nicht erstellt werden');
    }
  };

  const handleDelete = async (id: string) => {
    const doDelete = async () => {
      // Optimistic: remove from UI immediately
      setActivities(prev => prev.filter(a => a.id !== id));
      setHotelActivities(prev => prev.filter(a => a.id !== id));
      setAllTripActivities(prev => prev.filter(a => a.id !== id));
      try {
        await deleteActivity(id);
        showToast('Aktivität gelöscht', 'success');
        if (selectedDayId) await loadDayActivities(selectedDayId);
      } catch (e: any) {
        showToast('Fehler beim Löschen', 'error');
        if (selectedDayId) await loadDayActivities(selectedDayId);
      }
    };

    if (Platform.OS === 'web') {
      if (!window.confirm('Aktivität wirklich löschen?')) return;
      await doDelete();
    } else {
      Alert.alert('Löschen', 'Aktivität wirklich löschen?', [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Löschen', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const openEdit = (activity: Activity) => {
    setModalActivity(activity);
    setShowModal(true);
  };

  const handleDuplicate = async (activity: Activity) => {
    try {
      await createActivity({
        day_id: activity.day_id,
        trip_id: activity.trip_id,
        title: `${activity.title} (Kopie)`,
        description: activity.description,
        category: activity.category,
        start_time: activity.start_time,
        end_time: activity.end_time,
        location_name: activity.location_name,
        location_lat: activity.location_lat,
        location_lng: activity.location_lng,
        location_address: activity.location_address,
        cost: activity.cost,
        currency: activity.currency,
        sort_order: activities.length,
        check_in_date: activity.check_in_date,
        check_out_date: activity.check_out_date,
        category_data: activity.category_data,
      });
      showToast('Aktivität dupliziert', 'success');
      if (selectedDayId) loadDayActivities(selectedDayId);
    } catch {
      showToast('Fehler beim Duplizieren', 'error');
    }
  };

  const getContextMenuItems = (activity: Activity): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      { label: 'Bearbeiten', icon: 'create-outline', onPress: () => openEdit(activity) },
      { label: 'Duplizieren', icon: 'copy-outline', onPress: () => handleDuplicate(activity) },
    ];
    if (activity.location_lat && activity.location_lng) {
      items.push({
        label: 'In Maps öffnen',
        icon: 'map-outline',
        onPress: () => openInGoogleMaps(activity.location_lat!, activity.location_lng!, activity.location_name || undefined, activity.location_address || undefined),
      });
    }
    items.push({ label: 'Löschen', icon: 'trash-outline', onPress: () => handleDelete(activity.id), destructive: true });
    return items;
  };

  const openContextMenu = (activity: Activity, event: any) => {
    const pageX = event.nativeEvent?.pageX ?? event.pageX ?? 200;
    const pageY = event.nativeEvent?.pageY ?? event.pageY ?? 200;
    setContextMenu({ activity, position: { x: Math.min(pageX, 300), y: pageY } });
  };

  // Find accommodation for the selected day based on hotel activities
  const selectedDay = days.find(d => d.id === selectedDayId);
  const selectedDate = selectedDay?.date;

  const getAccommodationForDay = (date: string | undefined) => {
    if (!date) return { continuing: null, checkingOut: false, checkingIn: null };
    let continuing: Activity | null = null;
    let checkingOut = false;
    let checkingIn: Activity | null = null;
    for (const hotel of hotelActivities) {
      const ci = hotel.category_data?.check_in_date || hotel.check_in_date;
      const co = hotel.category_data?.check_out_date || hotel.check_out_date;
      if (!ci || !co) continue;
      // Continuing stay: checked in before today, checkout today or later
      if (ci < date && co >= date) {
        continuing = hotel;
        if (co === date) checkingOut = true;
      }
      // New check-in: check_in_date matches today
      if (ci === date) {
        checkingIn = hotel;
      }
    }
    return { continuing, checkingOut, checkingIn };
  };

  const { continuing: continuingStay, checkingOut: isCheckingOut, checkingIn: newCheckIn } = getAccommodationForDay(selectedDate);

  // Anreise/Abreise detection
  const isFirstDay = selectedDate === tripStartDate;
  const isLastDay = selectedDate === tripEndDate;

  const arrivalTransport = isFirstDay
    ? allTripActivities.find(a => a.category === 'transport' && a.category_data?.is_arrival)
    : null;
  const departureTransport = isLastDay
    ? allTripActivities.find(a => a.category === 'transport' && a.category_data?.is_departure)
    : null;

  const getNightsCount = (hotel: Activity) => {
    const ci = hotel.category_data?.check_in_date || hotel.check_in_date;
    const co = hotel.category_data?.check_out_date || hotel.check_out_date;
    if (!ci || !co) return null;
    const diff = Math.round((new Date(co).getTime() - new Date(ci).getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : null;
  };

  // Filter out hotels and arrival/departure from the normal activity list
  const filteredActivities = useMemo(
    () => activities.filter(a => a.category !== 'hotel' && !a.category_data?.is_arrival && !a.category_data?.is_departure),
    [activities],
  );

  // Task 3: Swipe navigation between days
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 20 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
    onPanResponderRelease: (_, gs) => {
      if (Math.abs(gs.dx) < 50) return;
      const currentIndex = days.findIndex(d => d.id === selectedDayId);
      if (currentIndex < 0) return;
      if (gs.dx < -50 && currentIndex < days.length - 1) {
        loadDayActivities(days[currentIndex + 1].id);
      } else if (gs.dx > 50 && currentIndex > 0) {
        loadDayActivities(days[currentIndex - 1].id);
      }
    },
  }), [days, selectedDayId, loadDayActivities]);

  // Keyboard shortcuts (web)
  useKeyboardShortcuts([
    {
      key: 'ArrowLeft',
      ignoreWhenTyping: true,
      handler: () => {
        const idx = days.findIndex(d => d.id === selectedDayId);
        if (idx > 0) loadDayActivities(days[idx - 1].id);
      },
    },
    {
      key: 'ArrowRight',
      ignoreWhenTyping: true,
      handler: () => {
        const idx = days.findIndex(d => d.id === selectedDayId);
        if (idx >= 0 && idx < days.length - 1) loadDayActivities(days[idx + 1].id);
      },
    },
    {
      key: 'n',
      ignoreWhenTyping: true,
      handler: () => {
        setModalActivity(null);
        setModalDefaultCategory(undefined);
        setModalDefaultCategoryData(selectedDate ? { date: selectedDate } : {});
        setShowModal(true);
      },
    },
  ]);

  const renderHotelCard = (hotel: Activity, type: 'continuing' | 'check-in', isCheckout?: boolean) => {
    const nights = getNightsCount(hotel);
    const badgeText = type === 'check-in' ? 'Check-in' : isCheckout ? 'Check-out' : 'Unterkunft';
    const badgeStyle = type === 'check-in' ? styles.checkInBadge : isCheckout ? styles.checkOutBadge : styles.continuingBadge;
    return (
      <TouchableOpacity style={styles.accommodationCard} key={`acc-${hotel.id}-${type}`} onPress={() => setViewActivity(hotel)} activeOpacity={0.7}>
        <View style={[styles.accommodationBadge, badgeStyle]}>
          <Text style={[styles.accommodationBadgeText, isCheckout && { color: colors.error }]}>{badgeText}</Text>
        </View>
        <View style={styles.accommodationIcon}><Icon name="bed-outline" size={iconSize.lg} color={colors.primary} /></View>
        <View style={styles.accommodationInfo}>
          <InlineEditText
            value={hotel.title}
            onSave={(v) => updateActivity(hotel.id, { title: v }).then(() => { if (selectedDayId) loadDayActivities(selectedDayId); })}
            style={styles.accommodationName}
            maxLength={100}
          />
          {nights && <Text style={styles.accommodationNights}>{nights} {nights === 1 ? 'Nacht' : 'Nächte'}</Text>}
          {hotel.location_name && <Text style={styles.accommodationAddress}>{hotel.location_name}</Text>}
        </View>
        <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleDelete(hotel.id); }} style={styles.deleteBtn}>
          <Icon name="close" size={16} color={colors.error} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderTravelCard = (type: 'arrival' | 'departure', transport: Activity | null | undefined) => {
    const label = type === 'arrival' ? 'Anreise' : 'Abreise';
    const iconName = type === 'arrival' ? 'airplane-outline' as const : 'airplane-outline' as const;
    const borderColor = type === 'arrival' ? colors.success : colors.error;

    if (transport) {
      const detail = formatCategoryDetail('transport', transport.category_data || {});
      return (
        <TouchableOpacity
          style={[styles.travelDayCard, { borderLeftColor: borderColor }]}
          onPress={() => setViewActivity(transport)}
          activeOpacity={0.7}
        >
          <View style={[styles.travelDayBadge, { backgroundColor: borderColor + '20' }]}>
            <Text style={[styles.travelDayBadgeText, { color: borderColor }]}>{label}</Text>
          </View>
          <View style={styles.travelDayIcon}><Icon name={iconName} size={iconSize.lg} color={borderColor} /></View>
          <View style={styles.travelDayInfo}>
            <Text style={styles.travelDayTitle}>{transport.title}</Text>
            {detail && <Text style={styles.travelDayDetail}>{linkifyText(detail)}</Text>}
            {transport.location_name && <Text style={styles.accommodationAddress}>{transport.location_name}</Text>}
            {transport.category_data?.transport_type === 'Flug' && transport.category_data?.flight_verified && (() => {
              const fs = flightStatuses.get(transport.id);
              const { label: statusLabel, color: statusColor } = fs ? getFlightStatusLabel(fs.status) : { label: 'Geplant', color: '#3498DB' };
              return statusLabel ? (
                <View style={[styles.flightStatusBadge, { backgroundColor: statusColor + '20', marginTop: 4 }]}>
                  <Text style={[styles.flightStatusText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
              ) : null;
            })()}
          </View>
          <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleDelete(transport.id); }} style={styles.deleteBtn}>
            <Icon name={NAV_ICONS.close} size={iconSize.xs} color={colors.error} />
          </TouchableOpacity>
        </TouchableOpacity>
      );
    }

    // Placeholder: no transport yet
    return (
      <TouchableOpacity
        style={[styles.travelDayCardEmpty, { borderLeftColor: borderColor }]}
        onPress={() => {
          setModalActivity(null);
          setModalDefaultCategory('transport');
          setModalDefaultCategoryData({
            ...(selectedDate ? { departure_date: selectedDate } : {}),
            [type === 'arrival' ? 'is_arrival' : 'is_departure']: true,
          });
          setShowModal(true);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.travelDayIcon}><Icon name="airplane-outline" size={iconSize.lg} color={borderColor} /></View>
        <Text style={styles.travelDayPlaceholder}>{label} hinzufügen</Text>
        <Icon name="add-circle-outline" size={iconSize.md} color={colors.primary} />
      </TouchableOpacity>
    );
  };

  const renderActivityDetail = (activity: Activity) => {
    const detail = formatCategoryDetail(activity.category, activity.category_data || {});
    if (detail) return <Text style={styles.activityDetail}>{linkifyText(detail)}</Text>;
    // Fallback to legacy fields
    if (activity.check_in_date) return <Text style={styles.activityDesc}>Check-in: {activity.check_in_date}</Text>;
    return null;
  };

  return (
    <View style={styles.container}>
      <Header
        title="Programm"
        rightAction={
          isFeatureAllowed('ai') ? (
            <TouchableOpacity onPress={() => setShowAiModal(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="sparkles-outline" size={iconSize.md} color={colors.secondary} />
            </TouchableOpacity>
          ) : undefined
        }
      />

      {loading && days.length === 0 ? (
        <ItinerarySkeleton />
      ) : (
      <>
      {/* Day Tabs */}
      <View style={styles.tabBar}>
        <ScrollView ref={tabScrollRef} horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent}>
          {days.map((day, i) => {
            const w = weather.get(day.date);
            const pc = photoCounts.get(day.id) || 0;
            return (
              <TouchableOpacity
                key={day.id}
                style={[styles.tab, selectedDayId === day.id && styles.tabActive]}
                onPress={() => loadDayActivities(day.id)}
              >
                <View style={styles.tabTopRow}>
                  <Text style={[styles.tabDay, selectedDayId === day.id && styles.tabDayActive]}>Tag {i + 1}</Text>
                  {pc > 0 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}><Icon name="images-outline" size={10} color={selectedDayId === day.id ? 'rgba(255,255,255,0.7)' : colors.textLight} /><Text style={[styles.tabPhotoCount, selectedDayId === day.id && styles.tabPhotoCountActive]}>{pc}</Text></View>}
                </View>
                <Text style={[styles.tabDate, selectedDayId === day.id && styles.tabDateActive]}>{formatDateShort(day.date)}</Text>
                {w && <Text style={[styles.tabWeather, selectedDayId === day.id && styles.tabWeatherActive]}>{w.icon} {w.tempMax}°</Text>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Activities Timeline with swipe */}
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
        <ScrollView style={styles.timeline} contentContainerStyle={styles.timelineContent} keyboardDismissMode="on-drag" refreshControl={<RefreshControl refreshing={loading} onRefresh={loadTripData} tintColor={colors.primary} />}>
          {/* Active polls */}
          {polls.filter(p => !p.is_closed).length > 0 && (
            <View style={styles.pollsSection}>
              {polls.filter(p => !p.is_closed).map(poll => (
                <PollCard key={poll.id} poll={poll} onUpdate={() => getPolls(tripId).then(setPolls).catch(() => {})} />
              ))}
            </View>
          )}

          {/* Weather summary for selected day */}
          {selectedDate && weather.get(selectedDate) && (() => {
            const w = weather.get(selectedDate)!;
            return (
              <View style={styles.weatherBanner}>
                <Text style={styles.weatherBannerIcon}>{w.icon}</Text>
                <Text style={styles.weatherBannerTemp}>{w.tempMax}° / {w.tempMin}°</Text>
              </View>
            );
          })()}

          {/* Anreise on first day */}
          {isFirstDay && renderTravelCard('arrival', arrivalTransport)}

          {/* Continuing accommodation at top */}
          {continuingStay && renderHotelCard(continuingStay, 'continuing', isCheckingOut)}

          {filteredActivities.length === 0 && !continuingStay && !newCheckIn ? (
            <View style={styles.emptyDay}>
              <Icon name={isGeneratingThisTrip ? 'sparkles' : 'create-outline'} size={48} color={colors.secondary} />
              <Text style={styles.emptyText}>
                {isGeneratingThisTrip ? 'Fable plant diesen Tag...' : 'Noch keine Aktivitäten'}
              </Text>
              <Text style={styles.emptySubtext}>
                {isGeneratingThisTrip ? 'Aktivitäten erscheinen automatisch' : 'Tippe auf +, um eine Aktivität hinzuzufügen'}
              </Text>
            </View>
          ) : (
            filteredActivities.map((activity, i) => (
              <TouchableOpacity
                key={activity.id}
                style={styles.activityCard}
                onPress={() => setViewActivity(activity)}
                onLongPress={(e) => openContextMenu(activity, e)}
                activeOpacity={0.7}
                // @ts-ignore — web right-click
                onContextMenu={Platform.OS === 'web' ? ((e: any) => { e.preventDefault(); openContextMenu(activity, e); }) : undefined}
              >
                <View style={styles.timelineLine}>
                  <View style={[styles.timelineDot, { backgroundColor: CATEGORY_COLORS[activity.category] || colors.primary }]} />
                  {i < filteredActivities.length - 1 && <View style={styles.timelineConnector} />}
                </View>
                <Card style={styles.activityContent}>
                  <View style={styles.activityHeader}>
                    <View style={[styles.activityIcon, { backgroundColor: (CATEGORY_COLORS[activity.category] || colors.primary) + '15' }]}>
                      <Icon name={getActivityIconName(activity.category, activity.category_data)} size={iconSize.sm} color={CATEGORY_COLORS[activity.category] || colors.primary} />
                    </View>
                    <View style={styles.activityInfo}>
                      <InlineEditText
                        value={activity.title}
                        onSave={(v) => updateActivity(activity.id, { title: v }).then(() => { if (selectedDayId) loadDayActivities(selectedDayId); })}
                        style={styles.activityTitle}
                        maxLength={100}
                      />
                      <InlineEditText
                        value={activity.start_time ? formatTime(activity.start_time) : ''}
                        onSave={(v) => {
                          const trimmed = v.trim();
                          if (!trimmed) {
                            updateActivity(activity.id, { start_time: null }).then(() => {
                              if (selectedDayId) loadDayActivities(selectedDayId);
                            });
                            return;
                          }
                          const timeMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
                          if (!timeMatch) return;
                          const time = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
                          updateActivity(activity.id, { start_time: time }).then(() => {
                            if (selectedDayId) resortActivitiesByTime(selectedDayId).then(() => loadDayActivities(selectedDayId));
                          });
                        }}
                        style={activity.start_time ? styles.activityTime : styles.activityTimePlaceholder}
                        maxLength={5}
                        placeholder="Uhrzeit hinzufügen"
                        allowEmpty
                      />
                    </View>
                    {/* Flight status badge — verified flights always show badge */}
                    {activity.category === 'transport' && activity.category_data?.transport_type === 'Flug' && activity.category_data?.flight_verified && (() => {
                      const fs = flightStatuses.get(activity.id);
                      const { label, color } = fs ? getFlightStatusLabel(fs.status) : { label: 'Geplant', color: '#3498DB' };
                      return label ? (
                        <View style={[styles.flightStatusBadge, { backgroundColor: color + '20' }]}>
                          <Text style={[styles.flightStatusText, { color }]}>{label}</Text>
                        </View>
                      ) : null;
                    })()}
                    <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleDelete(activity.id); }} style={styles.deleteBtn}>
                      <Icon name={NAV_ICONS.close} size={iconSize.xs} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                  {activity.location_name && (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Icon name="location-outline" size={14} color={colors.primary} />
                        <Text style={styles.activityLocation}>{activity.location_name}</Text>
                      </View>
                      {activity.location_lat && activity.location_lng && (
                        <TouchableOpacity onPress={(e: any) => { e.stopPropagation(); openInGoogleMaps(activity.location_lat!, activity.location_lng!, activity.location_name || undefined, activity.location_address || undefined); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Icon name="open-outline" size={14} color={colors.secondary} />
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                  {renderActivityDetail(activity)}
                  {activity.description && <Text style={styles.activityDesc}>{linkifyText(activity.description)}</Text>}
                  {/* Inline reactions summary */}
                  {reactionsMap[activity.id] && reactionsMap[activity.id].length > 0 && (
                    <View style={styles.inlineReactions}>
                      {['👍', '👎', '❤️', '🤔'].map(emoji => {
                        const count = reactionsMap[activity.id].filter(r => r.emoji === emoji).length;
                        return count > 0 ? (
                          <View key={emoji} style={styles.inlineReactionChip}>
                            <Text style={styles.inlineReactionEmoji}>{emoji}</Text>
                            <Text style={styles.inlineReactionCount}>{count}</Text>
                          </View>
                        ) : null;
                      })}
                    </View>
                  )}
                </Card>
              </TouchableOpacity>
            ))
          )}

          {/* New check-in accommodation at bottom */}
          {newCheckIn && renderHotelCard(newCheckIn, 'check-in')}
          {!newCheckIn && isCheckingOut && !isLastDay && (
            <View style={styles.noAccommodation}>
              <Icon name="alert-circle-outline" size={iconSize.sm} color="#E67E22" />
              <Text style={styles.noAccommodationText}>Keine Unterkunft geplant</Text>
            </View>
          )}

          {/* Abreise on last day */}
          {isLastDay && renderTravelCard('departure', departureTransport)}
        </ScrollView>
      </View>

      {/* Quick-add bar */}
      <View style={styles.quickAddBar}>
        {([
          { label: 'Aktivität', category: 'activity', icon: 'bicycle-outline' as const },
          { label: 'Essen', category: 'food', icon: 'restaurant-outline' as const },
        ]).map((item) => (
          <TouchableOpacity
            key={item.category}
            style={styles.quickAddBtn}
            onPress={() => {
              setModalActivity(null);
              setModalDefaultCategory(item.category);
              setModalDefaultCategoryData(selectedDate ? { date: selectedDate } : {});
              setShowModal(true);
            }}
            activeOpacity={0.7}
          >
            <Icon name={item.icon} size={iconSize.xs} color={CATEGORY_COLORS[item.category] || colors.primary} />
            <Text style={[styles.quickAddLabel, { color: CATEGORY_COLORS[item.category] || colors.primary }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => { setModalActivity(null); setModalDefaultCategory(undefined); setModalDefaultCategoryData(selectedDate ? { date: selectedDate } : {}); setShowModal(true); }} activeOpacity={0.8}>
        <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.fabGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Icon name="add" size={iconSize.xl} color="#FFFFFF" />
        </LinearGradient>
      </TouchableOpacity>

      <ContextMenu
        visible={!!contextMenu}
        onClose={() => setContextMenu(null)}
        items={contextMenu ? getContextMenuItems(contextMenu.activity) : []}
        position={contextMenu?.position ?? { x: 0, y: 0 }}
      />

      <ActivityViewModal
        visible={!!viewActivity}
        activity={viewActivity}
        onClose={() => setViewActivity(null)}
        onEdit={(a) => { setViewActivity(null); openEdit(a); }}
        onDelete={(id) => { setViewActivity(null); handleDelete(id); }}
        flightStatus={viewActivity ? flightStatuses.get(viewActivity.id) : undefined}
      />

      <ActivityModal
        visible={showModal}
        activity={modalActivity}
        onSave={handleModalSave}
        onCancel={() => { setShowModal(false); setModalActivity(null); setModalDefaultCategory(undefined); }}
        tripStartDate={tripStartDate}
        tripEndDate={tripEndDate}
        defaultCategory={modalDefaultCategory}
        defaultCategoryData={modalDefaultCategoryData}
      />
      </>
      )}

      {showAiModal && user && (
        <AiTripModal
          visible={showAiModal}
          onClose={() => setShowAiModal(false)}
          mode="enhance"
          tripId={tripId}
          userId={user.id}
        />
      )}

      <CreatePollModal
        visible={showPollModal}
        tripId={tripId}
        onClose={() => setShowPollModal(false)}
        onCreated={() => getPolls(tripId).then(setPolls).catch(() => {})}
      />

      <TripBottomNav tripId={tripId} activeTab="Itinerary" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  tabs: { flex: 1, maxHeight: 72 },
  tabsContent: { paddingHorizontal: spacing.md, gap: spacing.sm, alignItems: 'center' },
  tab: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.md, backgroundColor: colors.card },
  tabActive: { backgroundColor: colors.primary },
  tabTopRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 4 },
  tabDay: { ...typography.bodySmall, fontWeight: '600', textAlign: 'center' },
  tabDayActive: { color: '#FFFFFF' },
  tabPhotoCount: { fontSize: 10, color: colors.textLight },
  tabPhotoCountActive: { color: 'rgba(255,255,255,0.7)' },
  tabDate: { ...typography.caption, textAlign: 'center' },
  tabDateActive: { color: 'rgba(255,255,255,0.8)' },
  tabWeather: { ...typography.caption, fontSize: 10, textAlign: 'center' as const, color: colors.textLight, marginTop: 1 },
  tabWeatherActive: { color: 'rgba(255,255,255,0.7)' },
  timeline: { flex: 1 },
  timelineContent: { padding: spacing.md, paddingBottom: 140 },
  emptyDay: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyText: { ...typography.h3, marginBottom: spacing.xs },
  emptySubtext: { ...typography.bodySmall },
  activityCard: { flexDirection: 'row', marginBottom: spacing.md },
  timelineLine: { width: 24, alignItems: 'center' },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary, marginTop: spacing.md },
  timelineConnector: { width: 2, flex: 1, backgroundColor: colors.primaryLight, marginTop: 4 },
  activityContent: { flex: 1, marginLeft: spacing.sm },
  activityHeader: { flexDirection: 'row', alignItems: 'center' },
  activityIcon: { width: 32, height: 32, borderRadius: 16, marginRight: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  activityInfo: { flex: 1 },
  activityTitle: { ...typography.body, fontWeight: '600' },
  activityTime: { ...typography.caption, color: colors.primary },
  activityTimePlaceholder: { ...typography.caption, color: colors.textLight, fontStyle: 'italic' },
  activityLocation: { ...typography.bodySmall, marginTop: spacing.xs },
  activityDetail: { ...typography.bodySmall, color: colors.accent, marginTop: spacing.xs, fontWeight: '500' },
  activityDesc: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  inlineReactions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' },
  inlineReactionChip: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.background, paddingHorizontal: 6, paddingVertical: 2, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.border },
  inlineReactionEmoji: { fontSize: 12 },
  inlineReactionCount: { ...typography.caption, fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  deleteBtn: { padding: spacing.xs, marginLeft: spacing.xs },
  deleteBtnText: { fontSize: 16, color: colors.error },
  quickAddBar: {
    position: 'absolute', left: spacing.md, right: 56 + spacing.xl + spacing.md, bottom: 56 + spacing.md,
    flexDirection: 'row', gap: spacing.xs,
  },
  quickAddBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: spacing.sm, borderRadius: borderRadius.md,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    ...shadows.sm,
  },
  quickAddLabel: { ...typography.caption, fontWeight: '600', color: colors.primary },
  fab: { position: 'absolute', right: spacing.xl, bottom: 56 + spacing.md, width: 56, height: 56 },
  fabGradient: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', ...shadows.lg },
  fabText: { fontSize: 28, color: '#FFFFFF', fontWeight: '300' },
  accommodationCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.primary, ...shadows.sm },
  accommodationBadge: { position: 'absolute', top: spacing.xs, right: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.full },
  checkInBadge: { backgroundColor: colors.success + '20' },
  checkOutBadge: { backgroundColor: colors.error + '20' },
  continuingBadge: { backgroundColor: colors.primary + '20' },
  accommodationBadgeText: { ...typography.caption, fontSize: 10, fontWeight: '600', color: colors.primary },
  accommodationIcon: { fontSize: 28, marginRight: spacing.md },
  accommodationInfo: { flex: 1 },
  accommodationName: { ...typography.body, fontWeight: '600' },
  accommodationNights: { ...typography.caption, color: colors.primary, marginTop: 2 },
  accommodationAddress: { ...typography.caption, color: colors.textLight, marginTop: 2 },
  noAccommodation: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF8E1', borderRadius: borderRadius.lg, padding: spacing.md, marginTop: spacing.md, borderLeftWidth: 3, borderLeftColor: '#E67E22' },
  noAccommodationIcon: { fontSize: 20, marginRight: spacing.sm },
  noAccommodationText: { ...typography.bodySmall, color: '#E67E22', fontWeight: '500' },
  travelDayCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md, borderLeftWidth: 3, ...shadows.sm },
  travelDayCardEmpty: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md, borderLeftWidth: 3, borderStyle: 'dashed', borderWidth: 1.5, borderColor: colors.border },
  travelDayBadge: { position: 'absolute', top: spacing.xs, right: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.full },
  travelDayBadgeText: { ...typography.caption, fontSize: 10, fontWeight: '600' },
  travelDayIcon: { fontSize: 28, marginRight: spacing.md },
  travelDayInfo: { flex: 1 },
  travelDayTitle: { ...typography.body, fontWeight: '600' },
  travelDayDetail: { ...typography.caption, color: colors.accent, marginTop: 2, fontWeight: '500' },
  travelDayPlaceholder: { ...typography.bodySmall, color: colors.textLight, flex: 1 },
  travelDayPlus: { fontSize: 24, color: colors.primary, fontWeight: '300' },
  flightStatusBadge: { alignSelf: 'flex-start' as const, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.full },
  flightStatusText: { fontSize: 10, fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  weatherBanner: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
  weatherBannerIcon: { fontSize: 18 },
  weatherBannerTemp: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '500' as const },
  pollsSection: { marginBottom: spacing.md },
});
