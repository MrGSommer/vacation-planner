import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Header, Button, Input, Card, PlaceAutocomplete, CategoryFieldsInput, TripBottomNav } from '../../components/common';
import { PlaceResult } from '../../components/common/PlaceAutocomplete';
import { getDays, getActivities, createDay, createActivity, updateActivity, deleteActivity } from '../../api/itineraries';
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
      const trip = await getTrip(tripId);
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

  const loadActivities = async (dayId: string) => {
    setSelectedDayId(dayId);
    const acts = await getActivities(dayId);
    setActivities(acts);
  };

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
      });
      setShowEditModal(false);
      setEditActivity(null);
      if (selectedDayId) await loadActivities(selectedDayId);
    } catch {
      Alert.alert('Fehler', 'Aktivität konnte nicht aktualisiert werden');
    }
  };

  const getCategoryIcon = (cat: string) => ACTIVITY_CATEGORIES.find(c => c.id === cat)?.icon || '📌';

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

      {/* Activities Timeline */}
      <ScrollView style={styles.timeline} contentContainerStyle={styles.timelineContent}>
        {activities.length === 0 ? (
          <View style={styles.emptyDay}>
            <Text style={styles.emptyIcon}>📝</Text>
            <Text style={styles.emptyText}>Noch keine Aktivitäten</Text>
            <Text style={styles.emptySubtext}>Tippe auf +, um eine Aktivität hinzuzufügen</Text>
          </View>
        ) : (
          activities.map((activity, i) => (
            <TouchableOpacity key={activity.id} style={styles.activityCard} onPress={() => openEdit(activity)} onLongPress={() => handleDelete(activity.id)} activeOpacity={0.7}>
              <View style={styles.timelineLine}>
                <View style={[styles.timelineDot, { backgroundColor: CATEGORY_COLORS[activity.category] || colors.primary }]} />
                {i < activities.length - 1 && <View style={styles.timelineConnector} />}
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
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)} activeOpacity={0.8}>
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
                    onPress={() => { setNewCategory(cat.id); setNewCategoryData({}); }}
                  >
                    <Text style={styles.catIcon}>{cat.icon}</Text>
                    <Text style={[styles.catLabel, newCategory === cat.id && styles.catLabelActive]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Input label="Uhrzeit" placeholder="z.B. 09:00" value={newStartTime} onChangeText={setNewStartTime} />
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
              <Input label="Uhrzeit" placeholder="z.B. 09:00" value={editStartTime} onChangeText={setEditStartTime} />
              <CategoryFieldsInput category={editCategory} data={editCategoryData} onChange={setEditCategoryData} />
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
  tabs: { maxHeight: 72, borderBottomWidth: 1, borderBottomColor: colors.border },
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
  fab: { position: 'absolute', right: spacing.xl, bottom: spacing.xl, width: 56, height: 56 },
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
});
