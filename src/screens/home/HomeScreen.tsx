import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl, ImageBackground, ScrollView, Modal, ActivityIndicator, Platform } from 'react-native';
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
import { duplicateTrip } from '../../api/trips';
import { formatDateRange, getDayCount, isTripActive, getTripCountdownText, getDaysUntil, getCurrentTripDay } from '../../utils/dateHelpers';
import { colors, spacing, borderRadius, typography, shadows, gradients, iconSize } from '../../utils/theme';
import { getDisplayName } from '../../utils/profileHelpers';
import { EmptyState, Avatar, PaymentWarningBanner } from '../../components/common';
import { HomeScreenSkeleton } from '../../components/skeletons/HomeScreenSkeleton';
import { NotificationPrompt } from '../../components/common/NotificationPrompt';
import { ShareModal } from './ShareModal';
import { Icon, NAV_ICONS, MISC_ICONS } from '../../utils/icons';
import { SwipeableRow } from '../../components/common/SwipeableRow';

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
  onDuplicate: () => void;
  onEdit: () => void;
  isPast?: boolean;
}> = React.memo(({ trip, collaborators, currentUserId, onPress, onShare, onDelete, onDuplicate, onEdit, isPast }) => {
  const [menuOpen, setMenuOpen] = useState(false);
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
              <Icon name={NAV_ICONS.share} size={iconSize.sm} color="#FFFFFF" />
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
            onPress={(e: any) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.deleteBtn}
          >
            <Icon name="ellipsis-vertical" size={iconSize.sm} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );

  return (
    <View style={{ position: 'relative' }}>
      <TouchableOpacity style={[styles.card, isPast && styles.cardPast]} onPress={onPress} activeOpacity={0.85}>
        {trip.cover_image_url ? (
          <ImageBackground source={{ uri: trip.cover_image_url }} style={styles.cardGradient}>
            {cardInner}
          </ImageBackground>
        ) : (
          cardInner
        )}
      </TouchableOpacity>
      {menuOpen && (
        <>
          <TouchableOpacity style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} activeOpacity={1} />
          <View style={styles.cardMenu}>
            <TouchableOpacity style={styles.cardMenuItem} onPress={() => { setMenuOpen(false); onEdit(); }}>
              <Icon name="create-outline" size={iconSize.sm} color={colors.accent} />
              <Text style={styles.cardMenuLabel}>Bearbeiten</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cardMenuItem} onPress={() => { setMenuOpen(false); onShare(); }}>
              <Icon name="share-outline" size={iconSize.sm} color={colors.secondary} />
              <Text style={styles.cardMenuLabel}>Teilen</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cardMenuItem} onPress={() => { setMenuOpen(false); onDuplicate(); }}>
              <Icon name="copy-outline" size={iconSize.sm} color={colors.primary} />
              <Text style={styles.cardMenuLabel}>Kopieren</Text>
            </TouchableOpacity>
            <View style={styles.cardMenuDivider} />
            <TouchableOpacity style={styles.cardMenuItem} onPress={() => { setMenuOpen(false); onDelete(); }}>
              <Icon name="trash-outline" size={iconSize.sm} color={colors.error} />
              <Text style={[styles.cardMenuLabel, { color: colors.error }]}>Löschen</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
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

  // Persistent recap banner dismissals via localStorage
  const DISMISSED_RECAPS_KEY = 'wayfable_dismissed_recaps';
  const [dismissedRecaps, setDismissedRecaps] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(DISMISSED_RECAPS_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
  const dismissRecap = useCallback((tripId: string) => {
    setDismissedRecaps(prev => {
      const next = new Set(prev).add(tripId);
      try { localStorage.setItem(DISMISSED_RECAPS_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

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
    // Show modal immediately, load collaborators in background
    setDeleteTrip(trip);
    setDeleteCollabs([]);
    setDeleteLoading(true);
    try {
      const collabs = await getCollaborators(trip.id);
      const others = collabs.filter(c => c.user_id !== user?.id);
      setDeleteCollabs(others);
    } catch {
      // If collabs fail to load, still allow deletion
    } finally {
      setDeleteLoading(false);
    }
  }, [user?.id]);

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

  const handleDuplicateTrip = useCallback(async (trip: Trip) => {
    try {
      showToast('Trip wird kopiert...', 'info');
      await duplicateTrip(trip.id, user!.id);
      await fetchTrips();
      showToast(`"${trip.name}" kopiert`, 'success');
    } catch {
      showToast('Fehler beim Kopieren', 'error');
    }
  }, [user, fetchTrips, showToast]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Text style={styles.brandName}>WayFable</Text>
          <View style={styles.betaBadge}>
            <Text style={styles.betaText}>Beta</Text>
          </View>
        </View>
        <View style={styles.headerBody}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Meine Reisen</Text>
            <Text style={styles.headerSubtitle}>{trips.length} {trips.length === 1 ? 'Reise' : 'Reisen'}</Text>
          </View>
          {(() => {
            const nextTrip = activeTrips[0];
            if (!nextTrip) return null;
            const active = isTripActive(nextTrip.start_date, nextTrip.end_date);
            const tripDay = getCurrentTripDay(nextTrip.start_date, nextTrip.end_date);
            const daysUntil = getDaysUntil(nextTrip.start_date);

            if (!active && (daysUntil <= 0 || daysUntil > 60)) return null;

            const HYPE = [
              'Koffer packen!', 'Vorfreude pur!', 'Abenteuer wartet!',
              'Fernweh gestillt!', 'Countdown läuft!', 'Ab in die Ferne!',
              'Reisefieber!', 'Auf geht\'s!',
            ];
            const ACTIVE = [
              'Geniess es!', 'Abenteuer!', 'Entdecke!',
              'Lebe den Moment!', 'Unvergesslich!', 'Traumhaft!',
            ];

            const seed = nextTrip.id.charCodeAt(0) + nextTrip.id.charCodeAt(1);
            let mainText: string;
            let subText: string;
            let countdownIcon: typeof MISC_ICONS.globe;

            if (active && tripDay) {
              mainText = `Tag ${tripDay.day}/${tripDay.total}`;
              subText = ACTIVE[seed % ACTIVE.length];
              countdownIcon = MISC_ICONS.globe;
            } else if (daysUntil === 1) {
              mainText = 'Morgen!';
              subText = 'Es geht los!';
              countdownIcon = MISC_ICONS.rocket;
            } else {
              mainText = `${daysUntil} Tage`;
              subText = HYPE[seed % HYPE.length];
              countdownIcon = daysUntil <= 7 ? MISC_ICONS.fire : 'airplane-outline';
            }

            return (
              <TouchableOpacity
                style={styles.countdownWidget}
                onPress={() => handleTripPress(nextTrip)}
                activeOpacity={0.7}
              >
                <Icon name={countdownIcon} size={iconSize.lg} color={colors.accent} />
                <View style={styles.countdownTextWrap}>
                  <Text style={styles.countdownMain}>{mainText}</Text>
                  <Text style={styles.countdownTripName} numberOfLines={1}>{nextTrip.name}</Text>
                  <Text style={styles.countdownPhrase}>{subText}</Text>
                </View>
              </TouchableOpacity>
            );
          })()}
        </View>
        {paymentWarning && (
          <PaymentWarningBanner message={paymentErrorMessage} />
        )}
      </View>

      {initialLoad && loading ? (
        <HomeScreenSkeleton />
      ) : trips.length === 0 && !loading ? (
        <EmptyState
          iconName="earth-outline"
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
              <Icon name={MISC_ICONS.sparkles} size={iconSize.md} color={colors.secondary} />
              <View style={styles.fableBannerContent}>
                <Text style={styles.fableBannerTitle}>Dein Reiseplan ist fertig!</Text>
                <Text style={styles.fableBannerText}>
                  Fable hat deinen Plan{fableJob.context?.destination ? ` für ${fableJob.context.destination}` : ''} erstellt
                </Text>
              </View>
              <Icon name={NAV_ICONS.forward} size={iconSize.sm} color={colors.secondary} />
            </TouchableOpacity>
          )}

          {recentlyCompleted.filter(t => !dismissedRecaps.has(t.id)).map(trip => (
            <TouchableOpacity
              key={`recap-${trip.id}`}
              style={styles.recapBanner}
              onPress={() => {
                dismissRecap(trip.id);
                handleTripPress(trip);
              }}
              activeOpacity={0.7}
            >
              <Icon name={MISC_ICONS.confetti} size={iconSize.md} color={colors.success} />
              <View style={styles.recapBannerContent}>
                <Text style={styles.recapBannerTitle}>Reise erlebt!</Text>
                <Text style={styles.recapBannerText}>Schau dir den Rückblick von "{trip.name}" an</Text>
              </View>
              <TouchableOpacity
                onPress={(e: any) => { e.stopPropagation(); dismissRecap(trip.id); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon name={NAV_ICONS.close} size={iconSize.xs} color={colors.textSecondary} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}

          {activeTrips.map((trip, index) => (
            <React.Fragment key={trip.id}>
              {index > 0 && <Separator />}
              <SwipeableRow
                actions={[
                  { icon: 'copy-outline', color: colors.primary, onPress: () => handleDuplicateTrip(trip) },
                  { icon: 'share-outline', color: colors.secondary, onPress: () => setShareTrip(trip) },
                  { icon: 'trash-outline', color: colors.error, onPress: () => handleDeleteTrip(trip) },
                ]}
                disabled={Platform.OS === 'web'}
              >
                <TripCard
                  trip={trip}
                  collaborators={collabMap[trip.id] || []}
                  currentUserId={user?.id || ''}
                  onPress={() => handleTripPress(trip)}
                  onShare={() => setShareTrip(trip)}
                  onDelete={() => handleDeleteTrip(trip)}
                  onDuplicate={() => handleDuplicateTrip(trip)}
                  onEdit={() => navigation.navigate('EditTrip', { tripId: trip.id })}
                />
              </SwipeableRow>
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
                <Icon name={pastExpanded ? MISC_ICONS.collapse : MISC_ICONS.expand} size={iconSize.xs} color={colors.accent} />
              </TouchableOpacity>

              {pastExpanded && pastTrips.map((trip, index) => (
                <React.Fragment key={trip.id}>
                  {index > 0 && <Separator />}
                  <SwipeableRow
                    actions={[
                      { icon: 'copy-outline', color: colors.primary, onPress: () => handleDuplicateTrip(trip) },
                      { icon: 'share-outline', color: colors.secondary, onPress: () => setShareTrip(trip) },
                      { icon: 'trash-outline', color: colors.error, onPress: () => handleDeleteTrip(trip) },
                    ]}
                    disabled={Platform.OS === 'web'}
                  >
                    <TripCard
                      trip={trip}
                      collaborators={collabMap[trip.id] || []}
                      currentUserId={user?.id || ''}
                      onPress={() => handleTripPress(trip)}
                      onShare={() => setShareTrip(trip)}
                      onDelete={() => handleDeleteTrip(trip)}
                      onDuplicate={() => handleDuplicateTrip(trip)}
                      onEdit={() => navigation.navigate('EditTrip', { tripId: trip.id })}
                      isPast
                    />
                  </SwipeableRow>
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
        <View style={styles.deleteOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => !deleteLoading && setDeleteTrip(null)} />
          <View style={styles.deleteModal}>
            <Text style={styles.deleteModalTitle}>Reise löschen</Text>
            <Text style={styles.deleteModalInfo}>
              {deleteTrip ? `"${deleteTrip.name}"` : ''} wirklich löschen?
            </Text>

            {deleteLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
            ) : (
              <>
                {deleteCollabs.length > 0 && (
                  <>
                    <Text style={styles.deleteModalSectionTitle}>Oder Besitz übertragen an:</Text>
                    {deleteCollabs.map(collab => (
                      <TouchableOpacity
                        key={collab.user_id}
                        style={styles.transferOption}
                        onPress={() => handleTransferOwnership(collab)}
                      >
                        <Avatar uri={collab.profile.avatar_url} name={getDisplayName(collab.profile)} size={36} />
                        <Text style={styles.transferName}>{getDisplayName(collab.profile)}</Text>
                        <Icon name={NAV_ICONS.forward} size={iconSize.sm} color={colors.textSecondary} />
                      </TouchableOpacity>
                    ))}
                    <View style={styles.deleteModalDivider} />
                  </>
                )}

                <TouchableOpacity style={styles.forceDeleteBtn} onPress={handleForceDelete}>
                  <Icon name="trash-outline" size={iconSize.sm} color={colors.error} />
                  <View>
                    <Text style={styles.forceDeleteText}>Endgültig löschen</Text>
                    {deleteCollabs.length > 0 && <Text style={styles.forceDeleteHint}>Alle Teilnehmer verlieren Zugriff</Text>}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelBtn} onPress={() => setDeleteTrip(null)}>
                  <Text style={styles.cancelBtnText}>Abbrechen</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
        onPress={() => navigation.navigate('CreateTrip')}
        activeOpacity={0.8}
      >
        <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.fabGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Icon name={NAV_ICONS.add} size={iconSize.xl} color="#FFFFFF" />
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
  headerBody: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: spacing.sm },
  headerLeft: { flexShrink: 1, minWidth: 80 },
  headerTitle: { ...typography.h1 },
  headerSubtitle: { ...typography.bodySmall, marginTop: spacing.xs },
  countdownWidget: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm,
    backgroundColor: colors.accent + '15', paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.lg, borderWidth: 1.5, borderColor: colors.accent + '30',
    flexShrink: 0,
  },
  countdownEmoji: { fontSize: 28 },
  countdownTextWrap: { alignItems: 'flex-end' as const },
  countdownMain: { fontSize: 20, fontWeight: '800' as const, color: colors.accent, letterSpacing: -0.3 },
  countdownTripName: { ...typography.caption, color: colors.textSecondary, maxWidth: 130, textAlign: 'right' as const },
  countdownPhrase: { ...typography.caption, fontSize: 11, color: colors.accent, fontStyle: 'italic' as const },
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
  menuBackdrop: { position: 'absolute', top: -200, left: -200, right: -200, bottom: -200, zIndex: 998 },
  cardMenu: {
    position: 'absolute', right: spacing.md, bottom: spacing.md + 24,
    backgroundColor: '#FFFFFF', borderRadius: borderRadius.lg,
    paddingVertical: spacing.xs, minWidth: 180,
    ...shadows.lg, zIndex: 999,
    borderWidth: 1, borderColor: colors.border,
  },
  cardMenuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  cardMenuLabel: { ...typography.bodySmall, fontWeight: '500' },
  cardMenuDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
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
  forceDeleteBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
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
  recapBannerClose: { fontSize: 16, color: colors.textLight, padding: spacing.xs },
});
