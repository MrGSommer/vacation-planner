import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, PanResponder, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Header, Card, TripBottomNav, ActivityModal } from '../../components/common';
import type { ActivityFormData } from '../../components/common';
import { getDays, getActivities, getActivitiesForTrip, createDay, createActivity, updateActivity, deleteActivity } from '../../api/itineraries';
import { ItineraryDay, Activity } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { getDayDates, formatDateShort, formatTime } from '../../utils/dateHelpers';
import { getTrip } from '../../api/trips';
import { ACTIVITY_CATEGORIES } from '../../utils/constants';
import { useRealtime } from '../../hooks/useRealtime';
import { formatCategoryDetail, CATEGORY_COLORS } from '../../utils/categoryFields';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { useToast } from '../../contexts/ToastContext';
import { ItinerarySkeleton } from '../../components/skeletons/ItinerarySkeleton';

type Props = NativeStackScreenProps<RootStackParamList, 'Itinerary'>;

export const ItineraryScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const { showToast } = useToast();
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [dayDates, setDayDates] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [modalActivity, setModalActivity] = useState<Activity | null>(null);
  const [modalDefaultCategoryData, setModalDefaultCategoryData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [hotelActivities, setHotelActivities] = useState<Activity[]>([]);
  const [tripStartDate, setTripStartDate] = useState<string>('');
  const [tripEndDate, setTripEndDate] = useState<string>('');
  const tabScrollRef = useRef<ScrollView>(null);
  const tabWidths = useRef<number[]>([]);

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
      const [trip, allTripActivities] = await Promise.all([getTrip(tripId), getActivitiesForTrip(tripId)]);
      setHotelActivities(allTripActivities.filter(a => a.category === 'hotel'));
      setTripStartDate(trip.start_date);
      setTripEndDate(trip.end_date);
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
        const firstDayId = existingDays[0].id;
        setSelectedDayId(firstDayId);
        const acts = await getActivities(firstDayId);
        setActivities(acts);
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
  }, [scrollToActiveTab]);

  useEffect(() => { loadTripData(); }, [loadTripData]);
  useRealtime('activities', `trip_id=eq.${tripId}`, () => {
    // Reload hotel activities + current day
    getActivitiesForTrip(tripId).then(all => setHotelActivities(all.filter(a => a.category === 'hotel')));
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
      setShowModal(false);
      setModalActivity(null);
      const allActs = await getActivitiesForTrip(tripId);
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

  const getCategoryIcon = (cat: string) => ACTIVITY_CATEGORIES.find(c => c.id === cat)?.icon || '📌';

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

  const getNightsCount = (hotel: Activity) => {
    const ci = hotel.category_data?.check_in_date || hotel.check_in_date;
    const co = hotel.category_data?.check_out_date || hotel.check_out_date;
    if (!ci || !co) return null;
    const diff = Math.round((new Date(co).getTime() - new Date(ci).getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : null;
  };

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

  const renderHotelCard = (hotel: Activity, type: 'continuing' | 'check-in', isCheckout?: boolean) => {
    const nights = getNightsCount(hotel);
    const badgeText = type === 'check-in' ? 'Check-in' : isCheckout ? 'Check-out' : 'Unterkunft';
    const badgeStyle = type === 'check-in' ? styles.checkInBadge : isCheckout ? styles.checkOutBadge : styles.continuingBadge;
    return (
      <TouchableOpacity style={styles.accommodationCard} key={`acc-${hotel.id}-${type}`} onPress={() => openEdit(hotel)} activeOpacity={0.7}>
        <View style={[styles.accommodationBadge, badgeStyle]}>
          <Text style={[styles.accommodationBadgeText, isCheckout && { color: colors.error }]}>{badgeText}</Text>
        </View>
        <Text style={styles.accommodationIcon}>🏠</Text>
        <View style={styles.accommodationInfo}>
          <Text style={styles.accommodationName}>{hotel.title}</Text>
          {nights && <Text style={styles.accommodationNights}>{nights} {nights === 1 ? 'Nacht' : 'Nächte'}</Text>}
          {hotel.location_name && <Text style={styles.accommodationAddress}>📍 {hotel.location_name}</Text>}
        </View>
        <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleDelete(hotel.id); }} style={styles.deleteBtn}>
          <Text style={styles.deleteBtnText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderActivityDetail = (activity: Activity) => {
    const detail = formatCategoryDetail(activity.category, activity.category_data || {});
    if (detail) return <Text style={styles.activityDetail}>{detail}</Text>;
    // Fallback to legacy fields
    if (activity.check_in_date) return <Text style={styles.activityDesc}>Check-in: {activity.check_in_date}</Text>;
    return null;
  };

  return (
    <View style={styles.container}>
      <Header title="Programm" onBack={() => navigation.goBack()} />

      {loading && days.length === 0 ? (
        <ItinerarySkeleton />
      ) : (
      <>
      {/* Day Tabs */}
      <View style={styles.tabBar}>
        <ScrollView ref={tabScrollRef} horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent}>
          {days.map((day, i) => (
            <TouchableOpacity
              key={day.id}
              style={[styles.tab, selectedDayId === day.id && styles.tabActive]}
              onPress={() => loadDayActivities(day.id)}
            >
              <Text style={[styles.tabDay, selectedDayId === day.id && styles.tabDayActive]}>Tag {i + 1}</Text>
              <Text style={[styles.tabDate, selectedDayId === day.id && styles.tabDateActive]}>{formatDateShort(day.date)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Activities Timeline with swipe */}
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
        <ScrollView style={styles.timeline} contentContainerStyle={styles.timelineContent}>
          {/* Continuing accommodation at top */}
          {continuingStay && renderHotelCard(continuingStay, 'continuing', isCheckingOut)}

          {activities.filter(a => a.category !== 'hotel').length === 0 && !continuingStay && !newCheckIn ? (
            <View style={styles.emptyDay}>
              <Text style={styles.emptyIcon}>📝</Text>
              <Text style={styles.emptyText}>Noch keine Aktivitäten</Text>
              <Text style={styles.emptySubtext}>Tippe auf +, um eine Aktivität hinzuzufügen</Text>
            </View>
          ) : (
            activities.filter(a => a.category !== 'hotel').map((activity, i) => (
              <TouchableOpacity key={activity.id} style={styles.activityCard} onPress={() => openEdit(activity)} onLongPress={() => handleDelete(activity.id)} activeOpacity={0.7}>
                <View style={styles.timelineLine}>
                  <View style={[styles.timelineDot, { backgroundColor: CATEGORY_COLORS[activity.category] || colors.primary }]} />
                  {i < activities.filter(a => a.category !== 'hotel').length - 1 && <View style={styles.timelineConnector} />}
                </View>
                <Card style={styles.activityContent}>
                  <View style={styles.activityHeader}>
                    <Text style={styles.activityIcon}>{getCategoryIcon(activity.category)}</Text>
                    <View style={styles.activityInfo}>
                      <Text style={styles.activityTitle}>{activity.title}</Text>
                      {activity.start_time && <Text style={styles.activityTime}>{activity.start_time}</Text>}
                    </View>
                    <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleDelete(activity.id); }} style={styles.deleteBtn}>
                      <Text style={styles.deleteBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  {activity.location_name && <Text style={styles.activityLocation}>📍 {activity.location_name}</Text>}
                  {renderActivityDetail(activity)}
                  {activity.description && <Text style={styles.activityDesc}>{activity.description}</Text>}
                </Card>
              </TouchableOpacity>
            ))
          )}

          {/* New check-in accommodation at bottom */}
          {newCheckIn && renderHotelCard(newCheckIn, 'check-in')}
          {!newCheckIn && isCheckingOut && (
            <View style={styles.noAccommodation}>
              <Text style={styles.noAccommodationIcon}>⚠️</Text>
              <Text style={styles.noAccommodationText}>Keine Unterkunft geplant</Text>
            </View>
          )}
        </ScrollView>
      </View>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => { setModalActivity(null); setModalDefaultCategoryData(selectedDate ? { date: selectedDate } : {}); setShowModal(true); }} activeOpacity={0.8}>
        <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.fabGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={styles.fabText}>+</Text>
        </LinearGradient>
      </TouchableOpacity>

      <ActivityModal
        visible={showModal}
        activity={modalActivity}
        onSave={handleModalSave}
        onCancel={() => { setShowModal(false); setModalActivity(null); }}
        tripStartDate={tripStartDate}
        tripEndDate={tripEndDate}
        defaultCategoryData={modalDefaultCategoryData}
      />
      </>
      )}

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
  tabDay: { ...typography.bodySmall, fontWeight: '600', textAlign: 'center' },
  tabDayActive: { color: '#FFFFFF' },
  tabDate: { ...typography.caption, textAlign: 'center' },
  tabDateActive: { color: 'rgba(255,255,255,0.8)' },
  timeline: { flex: 1 },
  timelineContent: { padding: spacing.md },
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
  activityIcon: { fontSize: 24, marginRight: spacing.sm },
  activityInfo: { flex: 1 },
  activityTitle: { ...typography.body, fontWeight: '600' },
  activityTime: { ...typography.caption, color: colors.primary },
  activityLocation: { ...typography.bodySmall, marginTop: spacing.xs },
  activityDetail: { ...typography.bodySmall, color: colors.accent, marginTop: spacing.xs, fontWeight: '500' },
  activityDesc: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  deleteBtn: { padding: spacing.xs, marginLeft: spacing.xs },
  deleteBtnText: { fontSize: 16, color: colors.error },
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
});
