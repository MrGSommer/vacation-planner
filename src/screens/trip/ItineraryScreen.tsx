import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Header, Button, Input, Card, PlaceAutocomplete, CategoryFieldsInput, TimePickerInput, TripBottomNav } from '../../components/common';
import { PlaceResult } from '../../components/common/PlaceAutocomplete';
import { getDays, getActivities, getActivitiesForTrip, createDay, createActivity, updateActivity, deleteActivity } from '../../api/itineraries';
import { ItineraryDay, Activity } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { getDayDates, formatDateShort, formatTime } from '../../utils/dateHelpers';
import { getTrip } from '../../api/trips';
import { ACTIVITY_CATEGORIES } from '../../utils/constants';
import { useRealtime } from '../../hooks/useRealtime';
import { formatCategoryDetail, CATEGORY_COLORS } from '../../utils/categoryFields';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Itinerary'>;

export const ItineraryScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [dayDates, setDayDates] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('activity');
  const [newStartTime, setNewStartTime] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newLocationLat, setNewLocationLat] = useState<number | null>(null);
  const [newLocationLng, setNewLocationLng] = useState<number | null>(null);
  const [newLocationAddress, setNewLocationAddress] = useState<string | null>(null);
  const [newNotes, setNewNotes] = useState('');
  const [newCategoryData, setNewCategoryData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [hotelActivities, setHotelActivities] = useState<Activity[]>([]);
  const [tripStartDate, setTripStartDate] = useState<string>('');
  const [tripEndDate, setTripEndDate] = useState<string>('');
  const [editActivity, setEditActivity] = useState<Activity | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('activity');
  const [editStartTime, setEditStartTime] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editLocationLat, setEditLocationLat] = useState<number | null>(null);
  const [editLocationLng, setEditLocationLng] = useState<number | null>(null);
  const [editLocationAddress, setEditLocationAddress] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editCategoryData, setEditCategoryData] = useState<Record<string, any>>({});

  const loadData = useCallback(async () => {
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
        setSelectedDayId(existingDays[0].id);
      }

      if (selectedDayId) {
        const acts = await getActivities(selectedDayId);
        setActivities(acts);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [tripId, selectedDayId]);

  useEffect(() => { loadData(); }, [loadData]);
  useRealtime('activities', `trip_id=eq.${tripId}`, loadData);

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
      case 'stop': return catData.arrival_date;
      default: return catData.date;
    }
  };

  const loadActivities = async (dayId: string) => {
    setSelectedDayId(dayId);
    const acts = await getActivities(dayId);
    setActivities(acts);
  };

  const handleAddActivity = async () => {
    if (!newTitle.trim() || !selectedDayId) return;
    try {
      const actDate = getActivityDate(newCategory, newCategoryData);
      const targetDayId = getDayIdForDate(actDate) || selectedDayId;
      await createActivity({
        day_id: targetDayId,
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
      setNewTitle('');
      setNewNotes('');
      setNewLocation('');
      setNewLocationLat(null);
      setNewLocationLng(null);
      setNewLocationAddress(null);
      setNewStartTime('');
      setNewCategoryData({});
      await loadActivities(selectedDayId);
    } catch (e) {
      Alert.alert('Fehler', 'Aktivität konnte nicht erstellt werden');
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Löschen', 'Aktivität wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => {
        await deleteActivity(id);
        if (selectedDayId) await loadActivities(selectedDayId);
      }},
    ]);
  };

  const openEdit = (activity: Activity) => {
    setEditActivity(activity);
    setEditTitle(activity.title);
    setEditCategory(activity.category);
    setEditStartTime(activity.start_time || '');
    setEditLocation(activity.location_name || '');
    setEditLocationLat(activity.location_lat);
    setEditLocationLng(activity.location_lng);
    setEditLocationAddress(activity.location_address);
    setEditNotes(activity.description || '');
    setEditCategoryData(activity.category_data || {});
    setShowEditModal(true);
  };

  const handleEditSave = async () => {
    if (!editActivity || !editTitle.trim()) return;
    try {
      const actDate = getActivityDate(editCategory, editCategoryData);
      const newDayId = getDayIdForDate(actDate);
      await updateActivity(editActivity.id, {
        title: editTitle.trim(),
        category: editCategory,
        start_time: editStartTime || null,
        description: editNotes.trim() || null,
        location_name: editLocation.trim() || null,
        location_lat: editLocationLat,
        location_lng: editLocationLng,
        location_address: editLocationAddress,
        check_in_date: editCategoryData.check_in_date || null,
        check_out_date: editCategoryData.check_out_date || null,
        category_data: editCategoryData,
        ...(newDayId ? { day_id: newDayId } : {}),
      });
      setShowEditModal(false);
      setEditActivity(null);
      // Refresh hotel activities and current day
      const allActs = await getActivitiesForTrip(tripId);
      setHotelActivities(allActs.filter(a => a.category === 'hotel'));
      if (selectedDayId) await loadActivities(selectedDayId);
    } catch {
      Alert.alert('Fehler', 'Aktivität konnte nicht aktualisiert werden');
    }
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

      {/* Day Tabs */}
      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent}>
          {days.map((day, i) => (
            <TouchableOpacity
              key={day.id}
              style={[styles.tab, selectedDayId === day.id && styles.tabActive]}
              onPress={() => loadActivities(day.id)}
            >
              <Text style={[styles.tabDay, selectedDayId === day.id && styles.tabDayActive]}>Tag {i + 1}</Text>
              <Text style={[styles.tabDate, selectedDayId === day.id && styles.tabDateActive]}>{formatDateShort(day.date)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Activities Timeline */}
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

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => { setNewCategoryData(selectedDate ? { date: selectedDate } : {}); setShowModal(true); }} activeOpacity={0.8}>
        <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.fabGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={styles.fabText}>+</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Add Activity Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Aktivität hinzufügen</Text>
            <ScrollView>
              <Input label="Titel" placeholder="z.B. Stadtführung" value={newTitle} onChangeText={setNewTitle} />
              <Text style={styles.fieldLabel}>Kategorie</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                {ACTIVITY_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.catChip, newCategory === cat.id && styles.catChipActive]}
                    onPress={() => { setNewCategory(cat.id); setNewCategoryData(selectedDate ? { date: selectedDate } : {}); }}
                  >
                    <Text style={styles.catIcon}>{cat.icon}</Text>
                    <Text style={[styles.catLabel, newCategory === cat.id && styles.catLabelActive]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TimePickerInput label="Uhrzeit" value={newStartTime} onChange={setNewStartTime} placeholder="z.B. 09:00" />
              <CategoryFieldsInput category={newCategory} data={newCategoryData} onChange={setNewCategoryData} tripStartDate={tripStartDate} tripEndDate={tripEndDate} />
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
                  // Auto-fill sightseeing/food fields from Google Places
                  const updates: Record<string, any> = {};
                  if (place.opening_hours) updates.opening_hours = place.opening_hours;
                  if (place.website) updates.website_url = place.website;
                  if (Object.keys(updates).length > 0) {
                    setNewCategoryData(prev => ({ ...prev, ...updates }));
                  }
                }}
              />
              <Input label="Notizen" placeholder="Optionale Notizen..." value={newNotes} onChangeText={setNewNotes} multiline numberOfLines={3} style={{ height: 80, textAlignVertical: 'top' }} />
            </ScrollView>
            <View style={styles.modalButtons}>
              <Button title="Abbrechen" onPress={() => setShowModal(false)} variant="ghost" style={styles.modalBtn} />
              <Button title="Hinzufügen" onPress={handleAddActivity} disabled={!newTitle.trim()} style={styles.modalBtn} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Activity Modal */}
      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Aktivität bearbeiten</Text>
            <ScrollView>
              <Input label="Titel" placeholder="z.B. Stadtführung" value={editTitle} onChangeText={setEditTitle} />
              <Text style={styles.fieldLabel}>Kategorie</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                {ACTIVITY_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.catChip, editCategory === cat.id && styles.catChipActive]}
                    onPress={() => { setEditCategory(cat.id); setEditCategoryData({}); }}
                  >
                    <Text style={styles.catIcon}>{cat.icon}</Text>
                    <Text style={[styles.catLabel, editCategory === cat.id && styles.catLabelActive]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TimePickerInput label="Uhrzeit" value={editStartTime} onChange={setEditStartTime} placeholder="z.B. 09:00" />
              <CategoryFieldsInput category={editCategory} data={editCategoryData} onChange={setEditCategoryData} tripStartDate={tripStartDate} tripEndDate={tripEndDate} />
              <PlaceAutocomplete
                label="Ort"
                placeholder="z.B. Sagrada Familia"
                value={editLocation}
                onChangeText={setEditLocation}
                onSelect={(place: PlaceResult) => {
                  setEditLocation(place.name);
                  setEditLocationLat(place.lat);
                  setEditLocationLng(place.lng);
                  setEditLocationAddress(place.address);
                  const updates: Record<string, any> = {};
                  if (place.opening_hours) updates.opening_hours = place.opening_hours;
                  if (place.website) updates.website_url = place.website;
                  if (Object.keys(updates).length > 0) {
                    setEditCategoryData(prev => ({ ...prev, ...updates }));
                  }
                }}
              />
              <Input label="Notizen" placeholder="Optionale Notizen..." value={editNotes} onChangeText={setEditNotes} multiline numberOfLines={3} style={{ height: 80, textAlignVertical: 'top' }} />
            </ScrollView>
            <View style={styles.modalButtons}>
              <Button title="Abbrechen" onPress={() => { setShowEditModal(false); setEditActivity(null); }} variant="ghost" style={styles.modalBtn} />
              <Button title="Speichern" onPress={handleEditSave} disabled={!editTitle.trim()} style={styles.modalBtn} />
            </View>
          </View>
        </View>
      </Modal>

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
  fab: { position: 'absolute', right: spacing.xl, bottom: 56 + spacing.md, width: 56, height: 56 },
  fabGradient: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', ...shadows.lg },
  fabText: { fontSize: 28, color: '#FFFFFF', fontWeight: '300' },
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
