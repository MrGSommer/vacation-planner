import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Header, Button, Card, Input, PlaceAutocomplete, CategoryFieldsInput } from '../../components/common';
import { PlaceResult } from '../../components/common/PlaceAutocomplete';
import { getActivitiesForTrip, getDays, createActivity, deleteActivity } from '../../api/itineraries';
import { getTrip } from '../../api/trips';
import { calculateRouteForStops, formatDuration, formatDistance } from '../../services/directions';
import { Activity, Trip, ItineraryDay } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { ACTIVITY_CATEGORIES } from '../../utils/constants';
import { CATEGORY_COLORS, formatCategoryDetail } from '../../utils/categoryFields';
import { formatDateShort } from '../../utils/dateHelpers';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Stops'>;

export const StopsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const [activities, setActivities] = useState<Activity[]>([]);
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [travelInfo, setTravelInfo] = useState<Map<string, { duration: number; distance: number }>>(new Map());

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [selectedDayId, setSelectedDayId] = useState<string>('');
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('hotel');
  const [newStartTime, setNewStartTime] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newLocationLat, setNewLocationLat] = useState<number | null>(null);
  const [newLocationLng, setNewLocationLng] = useState<number | null>(null);
  const [newLocationAddress, setNewLocationAddress] = useState<string | null>(null);
  const [newNotes, setNewNotes] = useState('');
  const [newCategoryData, setNewCategoryData] = useState<Record<string, any>>({});

  const loadData = useCallback(async () => {
    try {
      const [t, acts, fetchedDays] = await Promise.all([
        getTrip(tripId),
        getActivitiesForTrip(tripId),
        getDays(tripId),
      ]);
      setTrip(t);
      setDays(fetchedDays);
      if (fetchedDays.length > 0 && !selectedDayId) {
        setSelectedDayId(fetchedDays[0].id);
      }

      const filtered = acts.filter(a => a.category === 'hotel' || a.category === 'stop');
      setActivities(filtered);

      // Calculate travel info between stops that have coordinates
      const withCoords = filtered.filter(a => a.location_lat && a.location_lng);
      if (withCoords.length >= 2) {
        calculateRouteForStops(withCoords.map(a => ({ id: a.id, lat: a.location_lat!, lng: a.location_lng! }))).then(info => {
          setTravelInfo(info);
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { loadData(); }, [loadData]);

  const getCategoryIcon = (cat: string) => ACTIVITY_CATEGORIES.find(c => c.id === cat)?.icon || '📌';

  const resetForm = () => {
    setNewTitle('');
    setNewNotes('');
    setNewLocation('');
    setNewLocationLat(null);
    setNewLocationLng(null);
    setNewLocationAddress(null);
    setNewStartTime('');
    setNewCategory('hotel');
    setNewCategoryData({});
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
      resetForm();
      await loadData();
    } catch (e) {
      Alert.alert('Fehler', 'Aktivität konnte nicht erstellt werden');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Löschen', 'Eintrag wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => {
        await deleteActivity(id);
        await loadData();
      }},
    ]);
  };

  return (
    <View style={styles.container}>
      <Header title="Route & Stops" onBack={() => navigation.goBack()} />

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {activities.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🗺️</Text>
            <Text style={styles.emptyText}>Keine Stops geplant</Text>
            <Text style={styles.emptySubtext}>Füge Übernachtungen und Zwischenstopps hinzu</Text>
          </View>
        ) : (
          activities.map((activity, i) => (
            <View key={activity.id}>
              {i > 0 && travelInfo.has(activity.id) && (
                <View style={styles.travelBadge}>
                  <Text style={styles.travelIcon}>🚗</Text>
                  <Text style={styles.travelText}>
                    {formatDuration(travelInfo.get(activity.id)!.duration)} · {formatDistance(travelInfo.get(activity.id)!.distance)}
                  </Text>
                </View>
              )}
              {i > 0 && !travelInfo.has(activity.id) && activity.location_lat && (
                <View style={styles.travelBadge}>
                  <Text style={styles.travelIcon}>🚗</Text>
                  <Text style={styles.travelText}>Berechne...</Text>
                </View>
              )}

              <Card style={styles.stopCard}>
                <View style={styles.stopHeader}>
                  <Text style={styles.stopIcon}>{getCategoryIcon(activity.category)}</Text>
                  <View style={styles.stopInfo}>
                    <Text style={styles.stopName}>{activity.title}</Text>
                    {(activity.location_name || activity.location_address) && (
                      <Text style={styles.stopAddress} numberOfLines={1}>
                        {activity.location_name || activity.location_address}
                      </Text>
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
                  <TouchableOpacity onPress={() => handleDelete(activity.id)} style={styles.deleteBtn}>
                    <Text style={styles.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            </View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)} activeOpacity={0.8}>
        <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.fabGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={styles.fabText}>+</Text>
        </LinearGradient>
      </TouchableOpacity>

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Stop hinzufügen</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {/* Day Picker */}
              <Text style={styles.fieldLabel}>Tag</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                {days.map(day => (
                  <TouchableOpacity
                    key={day.id}
                    style={[styles.catChip, selectedDayId === day.id && styles.catChipActive]}
                    onPress={() => setSelectedDayId(day.id)}
                  >
                    <Text style={[styles.catLabel, selectedDayId === day.id && styles.catLabelActive]}>
                      {formatDateShort(day.date)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Input label="Titel" placeholder="z.B. Hotel Schweizerhof" value={newTitle} onChangeText={setNewTitle} />

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
                placeholder="z.B. Hotel Schweizerhof, Luzern"
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
              <Button title="Abbrechen" onPress={() => { setShowModal(false); resetForm(); }} variant="ghost" style={styles.modalBtn} />
              <Button title="Hinzufügen" onPress={handleAddActivity} disabled={!newTitle.trim() || !selectedDayId} style={styles.modalBtn} />
            </View>
          </View>
        </View>
      </Modal>
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
  travelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.sky + '20',
    borderRadius: borderRadius.full,
    marginVertical: spacing.sm,
  },
  travelIcon: { fontSize: 14, marginRight: spacing.xs },
  travelText: { ...typography.caption, color: colors.sky, fontWeight: '600' },
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
  fab: { position: 'absolute', right: spacing.xl, bottom: spacing.xl, width: 56, height: 56 },
  fabGradient: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', ...shadows.lg },
  fabText: { fontSize: 28, color: '#FFFFFF', fontWeight: '300' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.card, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl, maxHeight: '80%' },
  modalTitle: { ...typography.h2, marginBottom: spacing.lg },
  fieldLabel: { ...typography.bodySmall, fontWeight: '600', marginBottom: spacing.sm },
  categoryRow: { marginBottom: spacing.md },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  catChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  catIcon: { fontSize: 16, marginRight: spacing.xs },
  catLabel: { ...typography.bodySmall },
  catLabelActive: { color: colors.primary, fontWeight: '600' },
  modalButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  modalBtn: { flex: 1 },
});
