import React, { useEffect, useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl, ImageBackground } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTrips } from '../../hooks/useTrips';
import { useAuthContext } from '../../contexts/AuthContext';
import { getCollaborators, CollaboratorWithProfile } from '../../api/invitations';
import { Trip } from '../../types/database';
import { formatDateRange, getDayCount } from '../../utils/dateHelpers';
import { colors, spacing, borderRadius, typography, shadows, gradients } from '../../utils/theme';
import { EmptyState, Avatar } from '../../components/common';
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

const MAX_AVATARS = 4;

const TripCard: React.FC<{
  trip: Trip;
  collaborators: CollaboratorWithProfile[];
  onPress: () => void;
  onShare: () => void;
}> = ({ trip, collaborators, onPress, onShare }) => {
  // Exclude owner, show only other collaborators
  const others = collaborators.filter(c => c.role !== 'owner');
  const shown = others.slice(0, MAX_AVATARS);
  const overflow = others.length - MAX_AVATARS;

  const cardInner = (
    <LinearGradient
      colors={trip.cover_image_url ? ['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.65)'] : [...gradients.sunset]}
      style={styles.cardGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    >
      <View style={styles.cardContent}>
        <View style={styles.cardTopRow}>
          <View style={[styles.badge, { backgroundColor: statusColors[trip.status] || colors.textLight }]}>
            <Text style={styles.badgeText}>{statusLabels[trip.status] || trip.status}</Text>
          </View>
          <View style={styles.cardTopRight}>
            {shown.length > 0 && (
              <View style={styles.avatarRow}>
                {shown.map((c, i) => (
                  <View key={c.id} style={[styles.avatarWrap, i > 0 && { marginLeft: -8 }]}>
                    <Avatar
                      uri={c.profile.avatar_url}
                      name={c.profile.full_name || c.profile.email}
                      size={26}
                    />
                  </View>
                ))}
                {overflow > 0 && (
                  <View style={[styles.avatarWrap, { marginLeft: -8 }]}>
                    <View style={styles.avatarOverflow}>
                      <Text style={styles.avatarOverflowText}>+{overflow}</Text>
                    </View>
                  </View>
                )}
              </View>
            )}
            <TouchableOpacity onPress={onShare} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.shareIcon}>↗</Text>
            </TouchableOpacity>
          </View>
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
  );

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {trip.cover_image_url ? (
        <ImageBackground source={{ uri: trip.cover_image_url }} style={styles.cardGradient}>
          {cardInner}
        </ImageBackground>
      ) : (
        cardInner
      )}
    </TouchableOpacity>
  );
};

export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { trips, loading, fetchTrips } = useTrips();
  const { user } = useAuthContext();
  const insets = useSafeAreaInsets();
  const [shareTrip, setShareTrip] = useState<Trip | null>(null);
  const [collabMap, setCollabMap] = useState<Record<string, CollaboratorWithProfile[]>>({});

  const loadCollaborators = useCallback(async () => {
    if (trips.length === 0) return;
    const map: Record<string, CollaboratorWithProfile[]> = {};
    await Promise.all(
      trips.map(async (t) => {
        try {
          map[t.id] = await getCollaborators(t.id);
        } catch {
          map[t.id] = [];
        }
      }),
    );
    setCollabMap(map);
  }, [trips]);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);
  useEffect(() => { loadCollaborators(); }, [loadCollaborators]);

  const handleTripPress = useCallback((trip: Trip) => {
    navigation.navigate('TripDetail', { tripId: trip.id });
  }, [navigation]);

  const handleShareClose = useCallback(() => {
    setShareTrip(null);
    // Refresh collaborators after modal closes (may have changed)
    loadCollaborators();
  }, [loadCollaborators]);

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
              collaborators={collabMap[item.id] || []}
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
          onClose={handleShareClose}
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
  cardTopRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  shareIcon: { fontSize: 20, color: '#FFFFFF', fontWeight: '700' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.full },
  badgeText: { ...typography.caption, color: '#FFFFFF', fontWeight: '600' },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderRadius: 15, overflow: 'hidden' },
  avatarOverflow: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  avatarOverflowText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  cardBottom: {},
  cardTitle: { ...typography.h2, color: '#FFFFFF', marginBottom: 2 },
  cardDestination: { ...typography.body, color: 'rgba(255,255,255,0.9)', marginBottom: 4 },
  cardDates: { ...typography.caption, color: 'rgba(255,255,255,0.8)' },
  fab: { position: 'absolute', right: spacing.xl, width: 60, height: 60 },
  fabGradient: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', ...shadows.lg },
  fabText: { fontSize: 32, color: '#FFFFFF', fontWeight: '300', marginTop: -2 },
});
