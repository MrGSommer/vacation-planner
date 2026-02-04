import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Header, Card, TripBottomNav, ActivityModal, ActivityViewModal } from '../../components/common';
import type { ActivityFormData } from '../../components/common';
import { getActivitiesForTrip, getDays, createActivity, updateActivity, deleteActivity } from '../../api/itineraries';
import { getTrip } from '../../api/trips';
import { getDirections, formatDuration, formatDistance, TRAVEL_MODES, TravelMode, DirectionsResult } from '../../services/directions';
import { BOTTOM_NAV_HEIGHT } from '../../components/common/TripBottomNav';
import { Activity, Trip, ItineraryDay } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { ACTIVITY_CATEGORIES } from '../../utils/constants';
import { CATEGORY_COLORS, formatCategoryDetail } from '../../utils/categoryFields';
import { openInGoogleMaps } from '../../utils/openInMaps';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { useToast } from '../../contexts/ToastContext';
import { StopsSkeleton } from '../../components/skeletons/StopsSkeleton';
import { RouteMapModal } from '../../components/map/RouteMapModal';

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
  const [activities, setActivities] = useState<Activity[]>([]);
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

  // Travel mode picker
  const [showTravelModePicker, setShowTravelModePicker] = useState<string | null>(null);
  const { showToast } = useToast();

  // Extract the primary date from category data for day mapping & sorting
  const getActivityDate = (category: string, catData: Record<string, any>): string | undefined => {
    switch (category) {
      case 'hotel': return catData.check_in_date;
      case 'stop': return catData.date;
      default: return catData.date;
    }
  };

  // Resolve the correct day_id for a given date string
  const getDayIdForDate = (date: string | undefined): string | null => {
    if (!date) return null;
    const day = days.find(d => d.date === date);
    return day?.id || null;
  };

  const loadData = useCallback(async () => {
    try {
      const [t, acts, fetchedDays] = await Promise.all([
        getTrip(tripId),
        getActivitiesForTrip(tripId),
        getDays(tripId),
      ]);
      setTrip(t);
      setDays(fetchedDays);

      const filtered = acts
        .filter(a => a.category === 'hotel' || a.category === 'stop')
        .sort((a, b) => {
          const dateA = getActivityDate(a.category, a.category_data || {}) || '9999-12-31';
          const dateB = getActivityDate(b.category, b.category_data || {}) || '9999-12-31';
          return dateA.localeCompare(dateB);
        });
      setActivities(filtered);

      // Load cached travel info from category_data
      const cached = new Map<string, DirectionsResult>();
      const needsCalc: { actId: string; prev: Activity; curr: Activity }[] = [];

      for (let i = 1; i < filtered.length; i++) {
        const prev = filtered[i - 1];
        const curr = filtered[i];
        if (!prev.location_lat || !prev.location_lng || !curr.location_lat || !curr.location_lng) continue;

        const cd = curr.category_data || {};
        const c: CachedTravel | undefined = cd.travel_from_prev;

        // Check if cache is valid (same origin + dest coordinates)
        if (c && c.origin_lat === prev.location_lat && c.origin_lng === prev.location_lng
          && c.dest_lat === curr.location_lat && c.dest_lng === curr.location_lng) {
          cached.set(curr.id, { duration: c.duration, distance: c.distance, mode: c.mode });
        } else {
          needsCalc.push({ actId: curr.id, prev, curr });
        }
      }
      setTravelInfo(cached);

      // Calculate missing routes in background
      if (needsCalc.length > 0) {
        setCalculating(new Set(needsCalc.map(n => n.actId)));
        for (const { actId, prev, curr } of needsCalc) {
          const mode: TravelMode = curr.category_data?.travel_from_prev?.mode || 'driving';
          const result = await getDirections(
            { lat: prev.location_lat!, lng: prev.location_lng! },
            { lat: curr.location_lat!, lng: curr.location_lng! },
            mode,
          );
          if (result) {
            cached.set(actId, result);
            setTravelInfo(new Map(cached));
            // Persist to DB
            const cacheData: CachedTravel = {
              duration: result.duration,
              distance: result.distance,
              mode: result.mode,
              origin_lat: prev.location_lat!,
              origin_lng: prev.location_lng!,
              dest_lat: curr.location_lat!,
              dest_lng: curr.location_lng!,
            };
            updateActivity(actId, {
              category_data: { ...curr.category_data, travel_from_prev: cacheData },
            }).catch(() => {});
          }
          setCalculating(prev => {
            const next = new Set(prev);
            next.delete(actId);
            return next;
          });
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { loadData(); }, [loadData]);

  const getCategoryIcon = (cat: string) => ACTIVITY_CATEGORIES.find(c => c.id === cat)?.icon || '📌';
  const getTravelIcon = (mode: TravelMode) => TRAVEL_MODES.find(m => m.id === mode)?.icon || '🚗';

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
      setTravelInfo(prev => {
        const next = new Map(prev);
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

  return (
    <View style={styles.container}>
      <Header
        title="Route & Stops"
        onBack={() => navigation.goBack()}
        rightAction={
          activities.length >= 2 ? (
            <TouchableOpacity onPress={() => setShowMapModal(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 20 }}>🗺️</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardDismissMode="on-drag">
        {loading ? (
          <StopsSkeleton />
        ) : activities.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🗺️</Text>
            <Text style={styles.emptyText}>Keine Stops geplant</Text>
            <Text style={styles.emptySubtext}>Füge Übernachtungen und Zwischenstopps hinzu</Text>
          </View>
        ) : (
          activities.map((activity, i) => (
            <View key={activity.id}>
              {i > 0 && activity.location_lat && activities[i - 1].location_lat && (
                <View style={styles.travelSection}>
                  {calculating.has(activity.id) ? (
                    <View style={styles.travelBadge}>
                      <Text style={styles.travelIcon}>⏳</Text>
                      <Text style={styles.travelText}>Berechne...</Text>
                    </View>
                  ) : travelInfo.has(activity.id) ? (
                    <TouchableOpacity
                      style={styles.travelBadge}
                      onPress={() => setShowTravelModePicker(
                        showTravelModePicker === activity.id ? null : activity.id
                      )}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.travelIcon}>{getTravelIcon(travelInfo.get(activity.id)!.mode)}</Text>
                      <Text style={styles.travelText}>
                        {formatDuration(travelInfo.get(activity.id)!.duration)} · {formatDistance(travelInfo.get(activity.id)!.distance)}
                      </Text>
                      <Text style={styles.travelChevron}>▾</Text>
                    </TouchableOpacity>
                  ) : null}

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
                            <Text style={styles.travelModeIcon}>{tm.icon}</Text>
                            <Text style={[styles.travelModeLabel, current === tm.id && styles.travelModeLabelActive]}>{tm.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              <TouchableOpacity activeOpacity={0.7} onPress={() => setViewActivity(activity)}>
                <Card style={styles.stopCard}>
                  <View style={styles.stopHeader}>
                    <Text style={styles.stopIcon}>{getCategoryIcon(activity.category)}</Text>
                    <View style={styles.stopInfo}>
                      <Text style={styles.stopName}>{activity.title}</Text>
                      {(activity.location_name || activity.location_address) && (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={[styles.stopAddress, { flex: 1 }]} numberOfLines={1}>
                            {activity.location_name || activity.location_address}
                          </Text>
                          {activity.location_lat && activity.location_lng && (
                            <TouchableOpacity onPress={(e: any) => { e.stopPropagation(); openInGoogleMaps(activity.location_lat!, activity.location_lng!, activity.location_name || undefined); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Text style={{ fontSize: 14, color: colors.textLight, marginLeft: 4 }}>↗</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                      <View style={styles.stopMeta}>
                        {activity.start_time && (
                          <Text style={styles.stopTime}>🕐 {activity.start_time}</Text>
                        )}
                        {(() => {
                          const detail = formatCategoryDetail(activity.category, activity.category_data || {});
                          return detail ? (
                            <Text style={[styles.stopDetail, { color: CATEGORY_COLORS[activity.category] || colors.primary }]}>{detail}</Text>
                          ) : null;
                        })()}
                      </View>
                    </View>
                  </View>
                  <View style={styles.stopActions}>
                    <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleDelete(activity.id); }} style={styles.deleteBtn}>
                      <Text style={styles.deleteBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openAddModal} activeOpacity={0.8}>
        <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.fabGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={styles.fabText}>+</Text>
        </LinearGradient>
      </TouchableOpacity>

      <ActivityViewModal
        visible={!!viewActivity}
        activity={viewActivity}
        onClose={() => setViewActivity(null)}
        onEdit={(a) => { setViewActivity(null); openEditModal(a); }}
        onDelete={(id) => { setViewActivity(null); handleDelete(id); }}
      />

      <ActivityModal
        visible={showModal}
        activity={editingActivity}
        onSave={handleModalSave}
        onCancel={() => { setShowModal(false); setEditingActivity(null); }}
        tripStartDate={trip?.start_date}
        tripEndDate={trip?.end_date}
        categoryFilter={['hotel', 'stop']}
        defaultCategory="hotel"
      />

      <RouteMapModal
        visible={showMapModal}
        onClose={() => setShowMapModal(false)}
        stops={activities}
        travelInfo={travelInfo}
      />

      <TripBottomNav tripId={tripId} activeTab="Stops" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { flex: 1 },
  listContent: { padding: spacing.md },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyText: { ...typography.h3, marginBottom: spacing.xs },
  emptySubtext: { ...typography.bodySmall },
  travelSection: { alignItems: 'center', marginVertical: spacing.sm },
  travelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.sky + '20',
    borderRadius: borderRadius.full,
  },
  travelIcon: { fontSize: 14, marginRight: spacing.xs },
  travelText: { ...typography.caption, color: colors.sky, fontWeight: '600' },
  travelChevron: { fontSize: 10, color: colors.sky, marginLeft: spacing.xs },
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
  travelModeIcon: { fontSize: 12, marginRight: 3 },
  travelModeLabel: { ...typography.caption, fontSize: 11 },
  travelModeLabelActive: { color: colors.sky, fontWeight: '600' },
  stopCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stopHeader: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  stopIcon: { fontSize: 28, marginRight: spacing.sm },
  stopInfo: { flex: 1 },
  stopName: { ...typography.body, fontWeight: '600' },
  stopAddress: { ...typography.caption, marginTop: 2 },
  stopMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  stopTime: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  stopDetail: { ...typography.caption, fontWeight: '600' },
  stopActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  deleteBtn: { padding: spacing.xs, marginLeft: spacing.xs },
  deleteBtnText: { fontSize: 16, color: colors.error },
  fab: { position: 'absolute', right: spacing.xl, bottom: BOTTOM_NAV_HEIGHT + spacing.md, width: 56, height: 56 },
  fabGradient: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', ...shadows.lg },
  fabText: { fontSize: 28, color: '#FFFFFF', fontWeight: '300' },
});
