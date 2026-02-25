import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl, ImageBackground, ScrollView, Platform, Alert, Modal, ActivityIndicator } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTrips } from '../../hooks/useTrips';
import { useAuthContext } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useToast } from '../../contexts/ToastContext';
import { getCollaboratorsForTrips, getCollaborators, transferOwnership, leaveTrip, CollaboratorWithProfile } from '../../api/invitations';
import { getRecentCreateModeJob, PlanJob } from '../../api/aiPlanJobs';
import { Trip } from '../../types/database';
import { formatDateRange, getDayCount, isTripActive, getTripCountdownText } from '../../utils/dateHelpers';
import { colors, spacing, borderRadius, typography, shadows, gradients } from '../../utils/theme';
import { getDisplayName } from '../../utils/profileHelpers';
import { EmptyState, Avatar, PaymentWarningBanner } from '../../components/common';
import { HomeScreenSkeleton } from '../../components/skeletons/HomeScreenSkeleton';
import { NotificationPrompt } from '../../components/common/NotificationPrompt';
import { ShareModal } from './ShareModal';

type Props = { navigation: NativeStackNavigationProp<any> };

const statusLabels: Record<string, string> = {
  planning: 'Planung',
  upcoming: 'Bevorstehend',
  active: 'Aktiv',
  completed: 'Erlebt',
};

const statusColors: Record<string, string> = {
  planning: colors.accent,
  upcoming: colors.sky,
  active: colors.success,
  completed: '#D4A017',
};

const MAX_AVATARS = 4;

const TripCard: React.FC<{
  trip: Trip;
  collaborators: CollaboratorWithProfile[];
  currentUserId: string;
  onPress: () => void;
  onShare: () => void;
  onDelete: () => void;
  isPast?: boolean;
}> = React.memo(({ trip, collaborators, currentUserId, onPress, onShare, onDelete, isPast }) => {
  const others = collaborators.filter(c => c.user_id !== currentUserId);
  const shown = others.slice(0, MAX_AVATARS);
  const overflow = others.length - MAX_AVATARS;

  const isTraveling = isTripActive(trip.start_date, trip.end_date);
  const displayLabel = isTraveling ? 'Unterwegs' : (statusLabels[trip.status] || trip.status);
  const displayColor = isTraveling ? colors.secondary : (statusColors[trip.status] || colors.textLight);
  const countdownText = getTripCountdownText(trip);

  const cardInner = (
    <LinearGradient
      colors={trip.cover_image_url ? ['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.65)'] : [...gradients.sunset]}
      style={styles.cardGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    >
      <View style={styles.cardContent}>
        <View style={styles.cardTopRow}>
          <View style={[styles.badge, { backgroundColor: displayColor }]}>
            <Text style={styles.badgeText}>{displayLabel}</Text>
          </View>
          <View style={styles.cardTopRight}>
            {shown.length > 0 && (
              <TouchableOpacity onPress={onShare} activeOpacity={0.7} style={styles.avatarRow}>
                {shown.map((c, i) => (
                  <View key={c.id} style={[styles.avatarWrap, i > 0 && styles.avatarOverlap]}>
                    <Avatar
                      uri={c.profile.avatar_url}
                      name={getDisplayName(c.profile)}
                      size={26}
                    />
                  </View>
                ))}
                {overflow > 0 && (
                  <View style={[styles.avatarWrap, styles.avatarOverlap]}>
                    <View style={styles.avatarOverflow}>
                      <Text style={styles.avatarOverflowText}>+{overflow}</Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onShare} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.shareIcon}>↗</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.cardBottom}>
          <View style={styles.cardBottomText}>
            <Text style={styles.cardTitle}>{trip.name}</Text>
            <Text style={styles.cardDestination}>{trip.destination}</Text>
            <Text style={styles.cardDates}>
              {formatDateRange(trip.start_date, trip.end_date)} · {getDayCount(trip.start_date, trip.end_date)} Tage
            </Text>
            {countdownText && (
              <Text style={styles.cardCountdown}>{countdownText}</Text>
            )}
          </View>
          <TouchableOpacity
            onPress={onDelete}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.deleteBtn}
          >
            <Text style={styles.deleteIcon}>🗑️</Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );

  return (
    <TouchableOpacity style={[styles.card, isPast && styles.cardPast]} onPress={onPress} activeOpacity={0.85}>
      {trip.cover_image_url ? (
        <ImageBackground source={{ uri: trip.cover_image_url }} style={styles.cardGradient}>
          {cardInner}
        </ImageBackground>
      ) : (
        cardInner
      )}
    </TouchableOpacity>
  );
});

const Separator = () => <View style={styles.separator} />;

export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { trips, loading, fetchTrips, remove } = useTrips();
  const { user } = useAuthContext();
  const { paymentWarning, paymentErrorMessage } = useSubscription();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const [shareTrip, setShareTrip] = useState<Trip | null>(null);
  const [collabMap, setCollabMap] = useState<Record<string, CollaboratorWithProfile[]>>({});
  const [initialLoad, setInitialLoad] = useState(true);
  const [pastExpanded, setPastExpanded] = useState(false);
  const [deleteTrip, setDeleteTrip] = useState<Trip | null>(null);
  const [deleteCollabs, setDeleteCollabs] = useState<CollaboratorWithProfile[]>([]);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [fableJob, setFableJob] = useState<PlanJob | null>(null);

  const { activeTrips, pastTrips, recentlyCompleted } = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const active: Trip[] = [];
    const past: Trip[] = [];
    const recent: Trip[] = [];
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    for (const trip of trips) {
      const endDate = new Date(trip.end_date);
      endDate.setDate(endDate.getDate() + 1);
      if (endDate < now) {
        past.push(trip);
        if (new Date(trip.end_date) >= sevenDaysAgo) {
          recent.push(trip);
        }
      } else {
        active.push(trip);
      }
    }

    active.sort((a, b) => a.start_date.localeCompare(b.start_date));
    past.sort((a, b) => b.start_date.localeCompare(a.start_date));

    return { activeTrips: active, pastTrips: past, recentlyCompleted: recent };
  }, [trips]);

  const loadCollaborators = useCallback(async () => {
    if (trips.length === 0) return;
    try {
      const map = await getCollaboratorsForTrips(trips.map(t => t.id));
      setCollabMap(map);
    } catch {
      // ignore
    }
  }, [trips]);

  useEffect(() => { fetchTrips().finally(() => setInitialLoad(false)); }, [fetchTrips]);
  useEffect(() => { loadCollaborators(); }, [loadCollaborators]);

  // Check for recently completed create-mode Fable jobs
  useEffect(() => {
    if (!user?.id) return;
    getRecentCreateModeJob(user.id).then(job => setFableJob(job)).catch(() => {});
  }, [user?.id]);

  const handleTripPress = useCallback((trip: Trip) => {
    navigation.navigate('TripDetail', { tripId: trip.id });
  }, [navigation]);

  const handleShareClose = useCallback(() => {
    setShareTrip(null);
    loadCollaborators();
  }, [loadCollaborators]);

  const handleDeleteTrip = useCallback(async (trip: Trip) => {
    try {
      const collabs = await getCollaborators(trip.id);
      const others = collabs.filter(c => c.user_id !== user?.id);
      if (others.length === 0) {
        // No collaborators — simple confirm & delete
        const doDelete = async () => {
          try {
            await remove(trip.id);
            showToast('Reise gelöscht', 'success');
          } catch {
            showToast('Fehler beim Löschen', 'error');
          }
        };
        if (Platform.OS === 'web') {
          if (window.confirm(`"${trip.name}" wirklich löschen?`)) doDelete();
        } else {
          Alert.alert('Reise löschen', `"${trip.name}" wirklich löschen?`, [
            { text: 'Abbrechen', style: 'cancel' },
            { text: 'Löschen', style: 'destructive', onPress: doDelete },
          ]);
        }
      } else {
        // Has collaborators — show transfer modal
        setDeleteCollabs(others);
        setDeleteTrip(trip);
      }
    } catch {
      showToast('Fehler beim Laden der Teilnehmer', 'error');
    }
  }, [user?.id, remove, showToast]);

  const handleForceDelete = useCallback(async () => {
    if (!deleteTrip) return;
    setDeleteLoading(true);
    try {
      await remove(deleteTrip.id);
      showToast('Reise gelöscht', 'success');
      setDeleteTrip(null);
    } catch {
      showToast('Fehler beim Löschen', 'error');
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteTrip, remove, showToast]);

  const handleTransferOwnership = useCallback(async (newOwner: CollaboratorWithProfile) => {
    if (!deleteTrip) return;
    setDeleteLoading(true);
    try {
      await transferOwnership(deleteTrip.id, newOwner.user_id);
      await leaveTrip(deleteTrip.id);
      await fetchTrips();
      showToast(`Besitz übertragen an ${getDisplayName(newOwner.profile)}`, 'success');
      setDeleteTrip(null);
    } catch {
      showToast('Fehler bei der Übertragung', 'error');
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteTrip, fetchTrips, showToast]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Text style={styles.brandName}>WayFable</Text>
          <View style={styles.betaBadge}>
            <Text style={styles.betaText}>Beta</Text>
          </View>
        </View>
        <Text style={styles.headerTitle}>Meine Reisen</Text>
        <Text style={styles.headerSubtitle}>{trips.length} {trips.length === 1 ? 'Reise' : 'Reisen'}</Text>
        {paymentWarning && (
          <PaymentWarningBanner message={paymentErrorMessage} />
        )}
      </View>

      {initialLoad && loading ? (
        <HomeScreenSkeleton />
      ) : trips.length === 0 && !loading ? (
        <EmptyState
          icon="🌍"
          title="Noch keine Reisen"
          message="Erstelle deine erste Reise und beginne mit der Planung!"
          actionLabel="Reise erstellen"
          onAction={() => navigation.navigate('CreateTrip')}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchTrips} tintColor={colors.primary} />}
        >
          {user && <NotificationPrompt userId={user.id} />}

          {fableJob && (
            <TouchableOpacity
              style={styles.fableBanner}
              onPress={() => {
                setFableJob(null);
                navigation.navigate('CreateTrip', { openFable: true });
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.fableBannerIcon}>✨</Text>
              <View style={styles.fableBannerContent}>
                <Text style={styles.fableBannerTitle}>Dein Reiseplan ist fertig!</Text>
                <Text style={styles.fableBannerText}>
                  Fable hat deinen Plan{fableJob.context?.destination ? ` für ${fableJob.context.destination}` : ''} erstellt
                </Text>
              </View>
              <Text style={styles.fableBannerArrow}>›</Text>
            </TouchableOpacity>
          )}

          {recentlyCompleted.map(trip => (
            <TouchableOpacity
              key={`recap-${trip.id}`}
              style={styles.recapBanner}
              onPress={() => handleTripPress(trip)}
              activeOpacity={0.7}
            >
              <Text style={styles.recapBannerIcon}>🎉</Text>
              <View style={styles.recapBannerContent}>
                <Text style={styles.recapBannerTitle}>Reise erlebt!</Text>
                <Text style={styles.recapBannerText}>Schau dir den Rückblick von "{trip.name}" an</Text>
              </View>
              <Text style={styles.recapBannerArrow}>›</Text>
            </TouchableOpacity>
          ))}

          {activeTrips.map((trip, index) => (
            <React.Fragment key={trip.id}>
              {index > 0 && <Separator />}
              <TripCard
                trip={trip}
                collaborators={collabMap[trip.id] || []}
                currentUserId={user?.id || ''}
                onPress={() => handleTripPress(trip)}
                onShare={() => setShareTrip(trip)}
                onDelete={() => handleDeleteTrip(trip)}
              />
            </React.Fragment>
          ))}

          {pastTrips.length > 0 && (
            <>
              <TouchableOpacity
                style={styles.pastHeader}
                onPress={() => setPastExpanded(v => !v)}
                activeOpacity={0.7}
              >
                <Text style={styles.pastHeaderText}>
                  Vergangene Reisen ({pastTrips.length})
                </Text>
                <Text style={styles.pastHeaderChevron}>
                  {pastExpanded ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>

              {pastExpanded && pastTrips.map((trip, index) => (
                <React.Fragment key={trip.id}>
                  {index > 0 && <Separator />}
                  <TripCard
                    trip={trip}
                    collaborators={collabMap[trip.id] || []}
                    currentUserId={user?.id || ''}
                    onPress={() => handleTripPress(trip)}
                    onShare={() => setShareTrip(trip)}
                    onDelete={() => handleDeleteTrip(trip)}
                    isPast
                  />
                </React.Fragment>
              ))}
            </>
          )}
        </ScrollView>
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

      {/* Delete / Transfer Modal */}
      <Modal visible={!!deleteTrip} animationType="fade" transparent>
        <TouchableOpacity
          style={styles.deleteOverlay}
          activeOpacity={1}
          onPress={() => !deleteLoading && setDeleteTrip(null)}
        >
          <View style={styles.deleteModal} onStartShouldSetResponder={() => true}>
            <Text style={styles.deleteModalTitle}>Reise löschen</Text>
            <Text style={styles.deleteModalInfo}>
              Diese Reise hat {deleteCollabs.length} {deleteCollabs.length === 1 ? 'Teilnehmer' : 'Teilnehmer'}.
            </Text>

            {deleteLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
            ) : (
              <>
                <Text style={styles.deleteModalSectionTitle}>Besitz übertragen an:</Text>
                {deleteCollabs.map(collab => (
                  <TouchableOpacity
                    key={collab.user_id}
                    style={styles.transferOption}
                    onPress={() => handleTransferOwnership(collab)}
                  >
                    <Avatar uri={collab.profile.avatar_url} name={getDisplayName(collab.profile)} size={36} />
                    <Text style={styles.transferName}>{getDisplayName(collab.profile)}</Text>
                    <Text style={styles.transferArrow}>{'›'}</Text>
                  </TouchableOpacity>
                ))}

                <View style={styles.deleteModalDivider} />

                <TouchableOpacity style={styles.forceDeleteBtn} onPress={handleForceDelete}>
                  <Text style={styles.forceDeleteText}>Endgültig löschen</Text>
                  <Text style={styles.forceDeleteHint}>Alle Teilnehmer verlieren Zugriff</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelBtn} onPress={() => setDeleteTrip(null)}>
                  <Text style={styles.cancelBtnText}>Abbrechen</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

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
  brandRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginBottom: spacing.xs },
  brandName: { fontSize: 22, fontWeight: '800' as const, color: colors.secondary },
  betaBadge: { backgroundColor: colors.secondary, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm },
  betaText: { ...typography.caption, color: '#FFFFFF', fontWeight: '700' as const, fontSize: 10 },
  headerTitle: { ...typography.h1 },
  headerSubtitle: { ...typography.bodySmall, marginTop: spacing.xs },
  card: { height: 200, borderRadius: borderRadius.lg, overflow: 'hidden', ...shadows.lg },
  cardPast: { opacity: 0.55 },
  cardGradient: { flex: 1 },
  cardContent: { flex: 1, justifyContent: 'space-between', padding: spacing.md },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTopRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  shareIcon: { fontSize: 20, color: '#FFFFFF', fontWeight: '700' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.full },
  badgeText: { ...typography.caption, color: '#FFFFFF', fontWeight: '600' },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderRadius: 15, overflow: 'hidden' },
  avatarOverlap: { marginLeft: -8 },
  listContent: { padding: spacing.md, paddingBottom: 100 },
  separator: { height: spacing.md },
  avatarOverflow: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  avatarOverflowText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  cardBottom: { flexDirection: 'row', alignItems: 'flex-end' },
  cardBottomText: { flex: 1 },
  cardTitle: { ...typography.h2, color: '#FFFFFF', marginBottom: 2 },
  cardDestination: { ...typography.body, color: 'rgba(255,255,255,0.9)', marginBottom: 4 },
  cardDates: { ...typography.caption, color: 'rgba(255,255,255,0.8)' },
  cardCountdown: { ...typography.caption, color: '#FFFFFF', fontWeight: '600' as const, marginTop: 2 },
  deleteBtn: { padding: spacing.xs },
  deleteIcon: { fontSize: 16, opacity: 0.7 },
  pastHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  pastHeaderText: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  pastHeaderChevron: { fontSize: 12, color: colors.textLight },
  fab: { position: 'absolute', right: spacing.xl, width: 60, height: 60 },
  fabGradient: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', ...shadows.lg },
  fabText: { fontSize: 32, color: '#FFFFFF', fontWeight: '300', marginTop: -2 },
  deleteOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  deleteModal: { backgroundColor: '#FFFFFF', borderRadius: borderRadius.lg, padding: spacing.xl, width: '100%', maxWidth: 400, ...shadows.lg },
  deleteModalTitle: { ...typography.h2, marginBottom: spacing.sm },
  deleteModalInfo: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg },
  deleteModalSectionTitle: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.sm },
  transferOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md },
  transferName: { ...typography.body, flex: 1, fontWeight: '500' },
  transferArrow: { fontSize: 20, color: colors.textLight },
  deleteModalDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  forceDeleteBtn: { paddingVertical: spacing.md },
  forceDeleteText: { ...typography.body, color: colors.error, fontWeight: '600' },
  forceDeleteHint: { ...typography.caption, color: colors.textLight, marginTop: 2 },
  cancelBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  cancelBtnText: { ...typography.body, color: colors.primary, fontWeight: '500' },
  fableBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary + '15',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  fableBannerIcon: { fontSize: 24 },
  fableBannerContent: { flex: 1 },
  fableBannerTitle: { ...typography.body, fontWeight: '600', color: colors.secondary },
  fableBannerText: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  fableBannerArrow: { fontSize: 22, color: colors.textLight },
  recapBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success + '15',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  recapBannerIcon: { fontSize: 24 },
  recapBannerContent: { flex: 1 },
  recapBannerTitle: { ...typography.body, fontWeight: '600', color: colors.success },
  recapBannerText: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  recapBannerArrow: { fontSize: 22, color: colors.textLight },
});
