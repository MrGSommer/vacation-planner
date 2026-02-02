import React, { useEffect, useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTrips } from '../../hooks/useTrips';
import { useAuthContext } from '../../contexts/AuthContext';
import { Trip } from '../../types/database';
import { formatDateRange, getDayCount } from '../../utils/dateHelpers';
import { colors, spacing, borderRadius, typography, shadows, gradients } from '../../utils/theme';
import { EmptyState } from '../../components/common';
import { ShareModal } from './ShareModal';

type Props = { navigation: NativeStackNavigationProp<any> };

const statusLabels: Record<string, string> = {
  planning: 'Planung',
  upcoming: 'Bevorstehend',
  active: 'Aktiv',
  completed: 'Abgeschlossen',
};

const statusColors: Record<string, string> = {
  planning: colors.accent,
  upcoming: colors.sky,
  active: colors.success,
  completed: colors.textLight,
};

const TripCard: React.FC<{ trip: Trip; onPress: () => void; onShare: () => void }> = ({ trip, onPress, onShare }) => (
  <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
    <LinearGradient
      colors={trip.cover_image_url ? ['transparent', 'rgba(0,0,0,0.6)'] : [...gradients.sunset]}
      style={styles.cardGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    >
      <View style={styles.cardContent}>
        <View style={styles.cardTopRow}>
          <View style={[styles.badge, { backgroundColor: statusColors[trip.status] || colors.textLight }]}>
            <Text style={styles.badgeText}>{statusLabels[trip.status] || trip.status}</Text>
          </View>
          <TouchableOpacity onPress={onShare} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.shareIcon}>↗</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.cardBottom}>
          <Text style={styles.cardTitle}>{trip.name}</Text>
          <Text style={styles.cardDestination}>{trip.destination}</Text>
          <Text style={styles.cardDates}>
            {formatDateRange(trip.start_date, trip.end_date)} · {getDayCount(trip.start_date, trip.end_date)} Tage
          </Text>
        </View>
      </View>
    </LinearGradient>
  </TouchableOpacity>
);

export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { trips, loading, fetchTrips } = useTrips();
  const { user } = useAuthContext();
  const insets = useSafeAreaInsets();
  const [shareTrip, setShareTrip] = useState<Trip | null>(null);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);

  const handleTripPress = useCallback((trip: Trip) => {
    navigation.navigate('TripDetail', { tripId: trip.id });
  }, [navigation]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Meine Reisen</Text>
        <Text style={styles.headerSubtitle}>{trips.length} {trips.length === 1 ? 'Reise' : 'Reisen'}</Text>
      </View>

      {trips.length === 0 && !loading ? (
        <EmptyState
          icon="🌍"
          title="Noch keine Reisen"
          message="Erstelle deine erste Reise und beginne mit der Planung!"
          actionLabel="Reise erstellen"
          onAction={() => navigation.navigate('CreateTrip')}
        />
      ) : (
        <FlashList
          data={trips}
          renderItem={({ item }) => (
            <TripCard
              trip={item}
              onPress={() => handleTripPress(item)}
              onShare={() => setShareTrip(item)}
            />
          )}
          contentContainerStyle={{ padding: spacing.md }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchTrips} tintColor={colors.primary} />}
        />
      )}

      {shareTrip && user && (
        <ShareModal
          visible={!!shareTrip}
          onClose={() => setShareTrip(null)}
          tripId={shareTrip.id}
          tripName={shareTrip.name}
          userId={user.id}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
        onPress={() => navigation.navigate('CreateTrip')}
        activeOpacity={0.8}
      >
        <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.fabGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={styles.fabText}>+</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.xl, paddingBottom: spacing.md },
  headerTitle: { ...typography.h1 },
  headerSubtitle: { ...typography.bodySmall, marginTop: spacing.xs },
  card: { height: 200, borderRadius: borderRadius.lg, overflow: 'hidden', ...shadows.lg },
  cardGradient: { flex: 1 },
  cardContent: { flex: 1, justifyContent: 'space-between', padding: spacing.md },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  shareIcon: { fontSize: 20, color: '#FFFFFF', fontWeight: '700' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.full },
  badgeText: { ...typography.caption, color: '#FFFFFF', fontWeight: '600' },
  cardBottom: {},
  cardTitle: { ...typography.h2, color: '#FFFFFF', marginBottom: 2 },
  cardDestination: { ...typography.body, color: 'rgba(255,255,255,0.9)', marginBottom: 4 },
  cardDates: { ...typography.caption, color: 'rgba(255,255,255,0.8)' },
  fab: { position: 'absolute', right: spacing.xl, width: 60, height: 60 },
  fabGradient: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', ...shadows.lg },
  fabText: { fontSize: 32, color: '#FFFFFF', fontWeight: '300', marginTop: -2 },
});
