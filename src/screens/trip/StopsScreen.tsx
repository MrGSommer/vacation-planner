import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Header, Button, Card } from '../../components/common';
import { PlaceAutocomplete, PlaceResult } from '../../components/common/PlaceAutocomplete';
import { Input } from '../../components/common';
import { getStops, createStop, deleteStop, reorderStops, updateStop } from '../../api/stops';
import { getTrip } from '../../api/trips';
import { calculateRouteForStops, formatDuration, formatDistance } from '../../services/directions';
import { TripStop, Trip } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Stops'>;

const calcNights = (arrival: string | null, departure: string | null): number | null => {
  if (!arrival || !departure) return null;
  const a = new Date(arrival);
  const d = new Date(departure);
  const diff = Math.round((d.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : null;
};

const formatDateShort = (d: string) => {
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' });
};

export const StopsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const [stops, setStops] = useState<TripStop[]>([]);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
  const [stopType, setStopType] = useState<'overnight' | 'waypoint'>('overnight');
  const [arrivalDate, setArrivalDate] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [travelInfo, setTravelInfo] = useState<Map<string, { duration: number; distance: number }>>(new Map());

  const loadData = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([getTrip(tripId), getStops(tripId)]);
      setTrip(t);
      setStops(s);
      // Use saved travel info from DB first
      const infoMap = new Map<string, { duration: number; distance: number }>();
      s.forEach(st => {
        if (st.travel_duration_from_prev != null && st.travel_distance_from_prev != null) {
          infoMap.set(st.id, { duration: st.travel_duration_from_prev, distance: st.travel_distance_from_prev });
        }
      });
      setTravelInfo(infoMap);

      // Recalculate in background if 2+ stops
      if (s.length >= 2) {
        calculateRouteForStops(s.map(st => ({ id: st.id, lat: st.lat, lng: st.lng }))).then(info => {
          setTravelInfo(info);
          for (const [stopId, result] of info.entries()) {
            updateStop(stopId, {
              travel_duration_from_prev: result.duration,
              travel_distance_from_prev: result.distance,
            }).catch(() => {});
          }
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAdd = async () => {
    if (!selectedPlace) return;
    const nights = calcNights(arrivalDate, departureDate);
    try {
      await createStop({
        trip_id: tripId,
        name: selectedPlace.name,
        place_id: selectedPlace.place_id,
        address: selectedPlace.address,
        lat: selectedPlace.lat,
        lng: selectedPlace.lng,
        type: stopType,
        nights: stopType === 'overnight' ? (nights || 1) : 0,
        arrival_date: arrivalDate || null,
        departure_date: stopType === 'overnight' ? (departureDate || null) : null,
        sort_order: stops.length,
        travel_duration_from_prev: null,
        travel_distance_from_prev: null,
      });
      setShowModal(false);
      setSelectedPlace(null);
      setStopType('overnight');
      setArrivalDate('');
      setDepartureDate('');
      await loadData();
    } catch (e) {
      Alert.alert('Fehler', 'Stop konnte nicht erstellt werden');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Löschen', 'Stop wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => {
        await deleteStop(id);
        await loadData();
      }},
    ]);
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= stops.length) return;
    const newStops = [...stops];
    [newStops[index], newStops[newIndex]] = [newStops[newIndex], newStops[index]];
    setStops(newStops);
    await reorderStops(tripId, newStops.map(s => s.id));
    await loadData();
  };

  return (
    <View style={styles.container}>
      <Header title="Route & Stops" onBack={() => navigation.goBack()} />

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {stops.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🗺️</Text>
            <Text style={styles.emptyText}>Keine Stops geplant</Text>
            <Text style={styles.emptySubtext}>Füge Übernachtungen und Zwischenstopps hinzu</Text>
          </View>
        ) : (
          stops.map((stop, i) => (
            <View key={stop.id}>
              {i > 0 && travelInfo.has(stop.id) && (
                <View style={styles.travelBadge}>
                  <Text style={styles.travelIcon}>🚗</Text>
                  <Text style={styles.travelText}>
                    {formatDuration(travelInfo.get(stop.id)!.duration)} · {formatDistance(travelInfo.get(stop.id)!.distance)}
                  </Text>
                </View>
              )}
              {i > 0 && !travelInfo.has(stop.id) && (
                <View style={styles.travelBadge}>
                  <Text style={styles.travelIcon}>🚗</Text>
                  <Text style={styles.travelText}>Berechne...</Text>
                </View>
              )}

              <Card style={styles.stopCard}>
                <View style={styles.stopHeader}>
                  <Text style={styles.stopIcon}>{stop.type === 'overnight' ? '🏨' : '📍'}</Text>
                  <View style={styles.stopInfo}>
                    <Text style={styles.stopName}>{stop.name}</Text>
                    {stop.address && <Text style={styles.stopAddress} numberOfLines={1}>{stop.address}</Text>}
                    <View style={styles.stopMeta}>
                      {stop.type === 'overnight' && stop.arrival_date && stop.departure_date && (
                        <Text style={styles.stopNights}>
                          {formatDateShort(stop.arrival_date)} – {formatDateShort(stop.departure_date)} ({stop.nights} {stop.nights === 1 ? 'Nacht' : 'Nächte'})
                        </Text>
                      )}
                      {stop.type === 'overnight' && (!stop.arrival_date || !stop.departure_date) && (
                        <Text style={styles.stopNights}>{stop.nights} {stop.nights === 1 ? 'Nacht' : 'Nächte'}</Text>
                      )}
                      {stop.type === 'waypoint' && (
                        <Text style={styles.stopTypeLabel}>Zwischenstopp</Text>
                      )}
                      {stop.type === 'waypoint' && stop.arrival_date && (
                        <Text style={styles.stopDate}>{formatDateShort(stop.arrival_date)}</Text>
                      )}
                    </View>
                  </View>
                </View>
                <View style={styles.stopActions}>
                  {i > 0 && (
                    <TouchableOpacity onPress={() => handleMove(i, -1)} style={styles.moveBtn}>
                      <Text style={styles.moveBtnText}>▲</Text>
                    </TouchableOpacity>
                  )}
                  {i < stops.length - 1 && (
                    <TouchableOpacity onPress={() => handleMove(i, 1)} style={styles.moveBtn}>
                      <Text style={styles.moveBtnText}>▼</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => handleDelete(stop.id)} style={styles.deleteBtn}>
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
              <PlaceAutocomplete
                label="Ort / Hotel"
                placeholder="z.B. Hotel Schweizerhof, Luzern"
                onSelect={setSelectedPlace}
              />

              <Text style={styles.fieldLabel}>Typ</Text>
              <View style={styles.typeRow}>
                <TouchableOpacity
                  style={[styles.typeChip, stopType === 'overnight' && styles.typeChipActive]}
                  onPress={() => setStopType('overnight')}
                >
                  <Text style={styles.typeIcon}>🏨</Text>
                  <Text style={[styles.typeLabel, stopType === 'overnight' && styles.typeLabelActive]}>Übernachtung</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeChip, stopType === 'waypoint' && styles.typeChipActive]}
                  onPress={() => setStopType('waypoint')}
                >
                  <Text style={styles.typeIcon}>📍</Text>
                  <Text style={[styles.typeLabel, stopType === 'waypoint' && styles.typeLabelActive]}>Zwischenstopp</Text>
                </TouchableOpacity>
              </View>

              {stopType === 'overnight' ? (
                <>
                  <Input label="Check-in (Anreise)" placeholder="YYYY-MM-DD" value={arrivalDate} onChangeText={setArrivalDate} />
                  <Input label="Check-out (Abreise)" placeholder="YYYY-MM-DD" value={departureDate} onChangeText={setDepartureDate} />
                  {arrivalDate && departureDate && calcNights(arrivalDate, departureDate) && (
                    <Text style={styles.nightsPreview}>
                      = {calcNights(arrivalDate, departureDate)} {calcNights(arrivalDate, departureDate) === 1 ? 'Nacht' : 'Nächte'}
                    </Text>
                  )}
                </>
              ) : (
                <Input label="Datum" placeholder="YYYY-MM-DD" value={arrivalDate} onChangeText={setArrivalDate} />
              )}
            </ScrollView>

            <View style={styles.modalButtons}>
              <Button title="Abbrechen" onPress={() => { setShowModal(false); setSelectedPlace(null); setArrivalDate(''); setDepartureDate(''); }} variant="ghost" style={styles.modalBtn} />
              <Button title="Hinzufügen" onPress={handleAdd} disabled={!selectedPlace} style={styles.modalBtn} />
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
  stopNights: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  stopTypeLabel: { ...typography.caption, color: colors.secondary, fontWeight: '600' },
  stopDate: { ...typography.caption, color: colors.textSecondary },
  stopActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  moveBtn: { padding: spacing.xs },
  moveBtnText: { fontSize: 16, color: colors.textSecondary },
  deleteBtn: { padding: spacing.xs, marginLeft: spacing.xs },
  deleteBtnText: { fontSize: 16, color: colors.error },
  fab: { position: 'absolute', right: spacing.xl, bottom: spacing.xl, width: 56, height: 56 },
  fabGradient: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', ...shadows.lg },
  fabText: { fontSize: 28, color: '#FFFFFF', fontWeight: '300' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.card, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl, maxHeight: '80%' },
  modalTitle: { ...typography.h2, marginBottom: spacing.lg },
  fieldLabel: { ...typography.bodySmall, fontWeight: '600', marginBottom: spacing.sm },
  typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  typeChip: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1.5, borderColor: colors.border },
  typeChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  typeIcon: { fontSize: 16, marginRight: spacing.xs },
  typeLabel: { ...typography.bodySmall },
  typeLabelActive: { color: colors.primary, fontWeight: '600' },
  nightsPreview: { ...typography.bodySmall, color: colors.primary, fontWeight: '600', textAlign: 'center', marginBottom: spacing.md },
  modalButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  modalBtn: { flex: 1 },
});
