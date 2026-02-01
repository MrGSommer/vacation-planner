import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTrip } from '../../api/trips';
import { getActivitiesForTrip } from '../../api/itineraries';
import { getTripExpenseTotal } from '../../api/budgets';
import { Trip } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { formatDateRange, getDayCount } from '../../utils/dateHelpers';
import { colors, spacing, borderRadius, typography, shadows, gradients } from '../../utils/theme';
import { LoadingScreen, Card } from '../../components/common';

type Props = NativeStackScreenProps<RootStackParamList, 'TripDetail'>;

const actionCards = [
  { key: 'Itinerary', icon: '📋', label: 'Programm', color: colors.primary },
  { key: 'Map', icon: '🗺️', label: 'Karte', color: colors.secondary },
  { key: 'Photos', icon: '📸', label: 'Fotos', color: colors.accent },
  { key: 'Budget', icon: '💰', label: 'Budget', color: colors.sunny },
  { key: 'Packing', icon: '🧳', label: 'Packliste', color: colors.sky },
];

export const TripDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const insets = useSafeAreaInsets();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [activityCount, setActivityCount] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [t, activities, spent] = await Promise.all([
          getTrip(tripId),
          getActivitiesForTrip(tripId),
          getTripExpenseTotal(tripId),
        ]);
        setTrip(t);
        setActivityCount(activities.length);
        setTotalSpent(spent);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tripId]);

  if (loading || !trip) return <LoadingScreen />;

  const days = getDayCount(trip.start_date, trip.end_date);

  return (
    <ScrollView style={styles.container} bounces={false}>
      <LinearGradient colors={[...gradients.ocean]} style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.tripName}>{trip.name}</Text>
        <Text style={styles.destination}>{trip.destination}</Text>
        <Text style={styles.dates}>{formatDateRange(trip.start_date, trip.end_date)}</Text>
      </LinearGradient>

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

        {/* Action Cards */}
        <View style={styles.grid}>
          {actionCards.map(card => (
            <TouchableOpacity
              key={card.key}
              style={styles.actionCard}
              onPress={() => navigation.navigate(card.key as any, { tripId })}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIcon, { backgroundColor: card.color + '20' }]}>
                <Text style={styles.actionEmoji}>{card.icon}</Text>
              </View>
              <Text style={styles.actionLabel}>{card.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {trip.notes && (
          <Card style={styles.notesCard}>
            <Text style={styles.notesTitle}>Notizen</Text>
            <Text style={styles.notesText}>{trip.notes}</Text>
          </Card>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.xl, paddingBottom: spacing.xxl },
  backBtn: { marginBottom: spacing.md },
  backText: { fontSize: 24, color: '#FFFFFF' },
  tripName: { ...typography.h1, color: '#FFFFFF', marginBottom: spacing.xs },
  destination: { ...typography.body, color: 'rgba(255,255,255,0.9)', marginBottom: spacing.xs },
  dates: { ...typography.bodySmall, color: 'rgba(255,255,255,0.8)' },
  content: { padding: spacing.md, marginTop: -spacing.lg },
  statsRow: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.md, ...shadows.md, marginBottom: spacing.lg },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { ...typography.h2, color: colors.primary },
  statLabel: { ...typography.caption, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  actionCard: { width: '30%', backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.md, alignItems: 'center', ...shadows.sm },
  actionIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  actionEmoji: { fontSize: 24 },
  actionLabel: { ...typography.bodySmall, fontWeight: '600', textAlign: 'center' },
  notesCard: { marginTop: spacing.lg },
  notesTitle: { ...typography.h3, marginBottom: spacing.sm },
  notesText: { ...typography.body, color: colors.textSecondary },
});
