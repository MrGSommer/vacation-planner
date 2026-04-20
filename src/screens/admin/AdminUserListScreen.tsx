import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, Alert, ActivityIndicator, Modal } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdminGuard } from '../../components/admin/AdminGuard';
import { Avatar } from '../../components/common';
import { adminListUsers, adminGetWaitlist, adminInviteUser, adminCheckEmailExists, adminUpdateWaitlistEntry, WaitlistEntry } from '../../api/admin';
import { getDisplayName } from '../../utils/profileHelpers';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { Profile } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { logError } from '../../services/errorLogger';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'AdminUserList'> };

const PAGE_SIZE = 20;

type Tab = 'users' | 'waitlist';

export const AdminUserListScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('users');

  // --- Users state ---
  const [users, setUsers] = useState<Profile[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<'all' | 'free' | 'premium' | 'trialing'>('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // --- Waitlist state ---
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(null);
  const [entryNotes, setEntryNotes] = useState<Record<string, string>>({});

  // --- Invite state ---
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invTier, setInvTier] = useState<'free' | 'premium'>('free');
  const [invCredits, setInvCredits] = useState('20');
  const [invNote, setInvNote] = useState('');
  const [inviting, setInviting] = useState(false);

  const loadUsers = useCallback(async (reset = true) => {
    const offset = reset ? 0 : users.length;
    if (reset) setLoading(true);
    else setLoadingMore(true);

    try {
      const { users: fetched, count } = await adminListUsers({
        search: search || undefined,
        tier: tierFilter === 'all' ? undefined : tierFilter,
        limit: PAGE_SIZE,
        offset,
      });
      setUsers(reset ? fetched : [...users, ...fetched]);
      setTotalCount(count);
    } catch (e) {
      logError(e, { component: 'AdminUserListScreen', context: { action: 'loadUsers' } });
      console.error('Admin list users error:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [search, tierFilter, users]);

  const loadWaitlist = useCallback(async () => {
    setWaitlistLoading(true);
    try {
      const data = await adminGetWaitlist();
      setWaitlist(data);
    } catch (e) {
      logError(e, { component: 'AdminUserListScreen', context: { action: 'loadWaitlist' } });
      console.error('Admin waitlist error:', e);
    } finally {
      setWaitlistLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'waitlist' && waitlist.length === 0) loadWaitlist();
  }, [tab]);

  // Debounced search for users
  useEffect(() => {
    if (tab !== 'users') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadUsers(true), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, tierFilter]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
  };

  const alert = (title: string, msg: string) => {
    if (Platform.OS === 'web') window.alert(`${title}: ${msg}`);
    else Alert.alert(title, msg);
  };

  const confirm = (msg: string): Promise<boolean> => {
    if (Platform.OS === 'web') return Promise.resolve(window.confirm(msg));
    return new Promise(resolve => {
      Alert.alert('Bestätigen', msg, [
        { text: 'Abbrechen', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Ja', onPress: () => resolve(true) },
      ]);
    });
  };

  // --- Waitlist actions ---
  const handleInviteFromWaitlist = async (entry: WaitlistEntry) => {
    const note = entryNotes[entry.id]?.trim() || entry.admin_note?.trim() || undefined;
    if (!(await confirm(`${entry.first_name || entry.email} einladen und Account erstellen?`))) return;
    setActionLoading(entry.id);
    try {
      const result = await adminInviteUser({
        email: entry.email,
        first_name: entry.first_name || undefined,
        last_name: entry.last_name || undefined,
        subscription_tier: 'free',
        ai_credits_balance: 20,
        admin_note: note,
      });
      await adminUpdateWaitlistEntry(entry.id, {
        status: 'invited',
        invited_at: new Date().toISOString(),
        invited_user_id: result.user_id,
        admin_note: note || null,
      });
      alert('Erfolg', `${entry.email} eingeladen${result.email_sent ? ' — E-Mail gesendet' : ''}`);
      setSelectedEntry(null);
      loadWaitlist();
    } catch (e: any) {
      logError(e, { component: 'AdminUserListScreen', context: { action: 'handleInviteFromWaitlist' } });
      alert('Fehler', e.message || 'Einladung fehlgeschlagen');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelWaitlist = async (entry: WaitlistEntry) => {
    const note = entryNotes[entry.id]?.trim() || entry.admin_note?.trim() || undefined;
    if (!(await confirm(`${entry.first_name || entry.email} stornieren?`))) return;
    setActionLoading(entry.id);
    try {
      await adminUpdateWaitlistEntry(entry.id, { status: 'cancelled', admin_note: note || null });
      setSelectedEntry(null);
      loadWaitlist();
    } catch (e: any) {
      logError(e, { component: 'AdminUserListScreen', context: { action: 'handleCancelWaitlist' } });
      alert('Fehler', e.message || 'Stornierung fehlgeschlagen');
    } finally {
      setActionLoading(null);
    }
  };

  // --- Direct invite ---
  const handleDirectInvite = async () => {
    if (!invEmail.trim()) {
      alert('Fehler', 'E-Mail ist erforderlich');
      return;
    }
    const check = await adminCheckEmailExists(invEmail.trim());
    if (check.exists) {
      alert('Fehler', check.where === 'profile'
        ? 'Diese E-Mail hat bereits einen Account.'
        : 'Diese E-Mail ist bereits auf der Warteliste.');
      return;
    }
    if (!(await confirm(`${invEmail} einladen?`))) return;
    setInviting(true);
    try {
      const result = await adminInviteUser({
        email: invEmail.trim(),
        subscription_tier: invTier,
        ai_credits_balance: parseInt(invCredits, 10) || 0,
        admin_note: invNote.trim() || undefined,
      });
      alert('Erfolg', `Account erstellt für ${result.email}${result.email_sent ? ' — Einladungs-E-Mail gesendet' : ''}`);
      setInvEmail('');
      setInvTier('free');
      setInvCredits('20');
      setInvNote('');
      setShowInviteModal(false);
    } catch (e: any) {
      logError(e, { component: 'AdminUserListScreen', context: { action: 'handleDirectInvite' } });
      alert('Fehler', e.message || 'Einladung fehlgeschlagen');
    } finally {
      setInviting(false);
    }
  };

  const filters: { label: string; value: 'all' | 'free' | 'premium' | 'trialing' }[] = [
    { label: 'Alle', value: 'all' },
    { label: 'Free', value: 'free' },
    { label: 'Premium', value: 'premium' },
    { label: 'Trialing', value: 'trialing' },
  ];

  const pendingWaitlist = waitlist.filter(w => w.status === 'pending' && w.confirmed);
  const unconfirmedWaitlist = waitlist.filter(w => w.status === 'pending' && !w.confirmed);
  const processedWaitlist = waitlist.filter(w => w.status !== 'pending');

  const tabs: { label: string; value: Tab; badge?: number }[] = [
    { label: 'Benutzer', value: 'users', badge: totalCount },
    { label: 'Warteliste', value: 'waitlist', badge: pendingWaitlist.length || undefined },
  ];

  return (
    <AdminGuard>
      <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('AdminDashboard')} style={styles.backBtn}>
            <Text style={styles.backText}>{'<'} Zurück</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Mitglieder</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowInviteModal(true)}>
            <Text style={styles.addBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {tabs.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.tabBtn, tab === t.value && styles.tabActive]}
              onPress={() => setTab(t.value)}
            >
              <Text style={[styles.tabText, tab === t.value && styles.tabTextActive]}>{t.label}</Text>
              {t.badge != null && t.badge > 0 && (
                <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{t.badge}</Text></View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* === Users Tab === */}
        {tab === 'users' && (
          <>
            <TextInput
              style={styles.searchInput}
              placeholder="Name oder Email suchen..."
              placeholderTextColor={colors.textLight}
              value={search}
              onChangeText={setSearch}
            />
            <View style={styles.filterRow}>
              {filters.map((f) => (
                <TouchableOpacity
                  key={f.value}
                  style={[styles.filterChip, tierFilter === f.value && styles.filterChipActive]}
                  onPress={() => setTierFilter(f.value)}
                >
                  <Text style={[styles.filterText, tierFilter === f.value && styles.filterTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {loading ? (
              <Text style={styles.loadingText}>Laden...</Text>
            ) : users.length === 0 ? (
              <Text style={styles.emptyText}>Keine Benutzer gefunden</Text>
            ) : (
              <View style={styles.tableCard}>
                {users.map((user, idx) => (
                  <TouchableOpacity
                    key={user.id}
                    style={[styles.userRow, idx > 0 && styles.rowBorder]}
                    onPress={() => navigation.navigate('AdminUserDetail', { userId: user.id })}
                  >
                    <Avatar uri={user.avatar_url} name={getDisplayName(user)} size={36} />
                    <View style={styles.userInfo}>
                      <Text style={styles.userName} numberOfLines={1}>{getDisplayName(user)}</Text>
                      <Text style={styles.userEmail} numberOfLines={1}>{user.email}</Text>
                    </View>
                    <View style={[styles.tierBadge, user.subscription_tier === 'premium' && styles.tierPremium, user.subscription_status === 'trialing' && styles.tierTrialing]}>
                      <Text style={[styles.tierText, user.subscription_tier === 'premium' && styles.tierTextPremium, user.subscription_status === 'trialing' && styles.tierTextTrialing]}>
                        {user.subscription_status === 'trialing' ? 'Trial' : user.subscription_tier === 'premium' ? 'Premium' : 'Free'}
                      </Text>
                    </View>
                    <Text style={styles.creditsText}>{user.ai_credits_balance}</Text>
                    <Text style={styles.dateText}>{formatDate(user.created_at)}</Text>
                    <Text style={styles.arrow}>{'>'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {!loading && users.length < totalCount && (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={() => loadUsers(false)} disabled={loadingMore}>
                <Text style={styles.loadMoreText}>{loadingMore ? 'Laden...' : 'Mehr laden'}</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* === Waitlist Tab === */}
        {tab === 'waitlist' && (
          <>
            {waitlistLoading ? (
              <Text style={styles.loadingText}>Laden...</Text>
            ) : waitlist.length === 0 ? (
              <Text style={styles.emptyText}>Keine Wartelisten-Einträge</Text>
            ) : (
              <>
                {/* Confirmed & pending */}
                {pendingWaitlist.length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>Bestätigt — bereit zum Einladen ({pendingWaitlist.length})</Text>
                    <View style={styles.tableCard}>
                      {pendingWaitlist.map((entry, idx) => (
                        <TouchableOpacity
                          key={entry.id}
                          style={[styles.waitlistRow, idx > 0 && styles.rowBorder]}
                          onPress={() => setSelectedEntry(entry)}
                        >
                          <View style={styles.waitlistInfo}>
                            <Text style={styles.userName} numberOfLines={1}>
                              {[entry.first_name, entry.last_name].filter(Boolean).join(' ') || '—'}
                            </Text>
                            <Text style={styles.userEmail} numberOfLines={1}>{entry.email}</Text>
                            <Text style={styles.dateTextSmall}>{formatDate(entry.created_at)}</Text>
                          </View>
                          <Text style={styles.arrow}>{'>'}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* Unconfirmed */}
                {unconfirmedWaitlist.length > 0 && (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>Nicht bestätigt ({unconfirmedWaitlist.length})</Text>
                    <View style={styles.tableCard}>
                      {unconfirmedWaitlist.map((entry, idx) => (
                        <TouchableOpacity
                          key={entry.id}
                          style={[styles.waitlistRow, idx > 0 && styles.rowBorder]}
                          onPress={() => setSelectedEntry(entry)}
                        >
                          <View style={styles.waitlistInfo}>
                            <Text style={styles.userName} numberOfLines={1}>
                              {[entry.first_name, entry.last_name].filter(Boolean).join(' ') || '—'}
                            </Text>
                            <Text style={styles.userEmail} numberOfLines={1}>{entry.email}</Text>
                            <Text style={styles.dateTextSmall}>{formatDate(entry.created_at)}</Text>
                          </View>
                          <View style={[styles.statusBadge, { backgroundColor: colors.textLight + '20' }]}>
                            <Text style={[styles.statusText, { color: colors.textLight }]}>Unbestätigt</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* Processed (invited/cancelled) */}
                {processedWaitlist.length > 0 && (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>Bearbeitet ({processedWaitlist.length})</Text>
                    <View style={styles.tableCard}>
                      {processedWaitlist.map((entry, idx) => (
                        <TouchableOpacity
                          key={entry.id}
                          style={[styles.waitlistRow, idx > 0 && styles.rowBorder]}
                          onPress={() => setSelectedEntry(entry)}
                        >
                          <View style={styles.waitlistInfo}>
                            <Text style={styles.userName} numberOfLines={1}>
                              {[entry.first_name, entry.last_name].filter(Boolean).join(' ') || '—'}
                            </Text>
                            <Text style={styles.userEmail} numberOfLines={1}>{entry.email}</Text>
                          </View>
                          <View style={[
                            styles.statusBadge,
                            entry.status === 'invited' && { backgroundColor: colors.success + '20' },
                            entry.status === 'cancelled' && { backgroundColor: colors.error + '20' },
                          ]}>
                            <Text style={[
                              styles.statusText,
                              entry.status === 'invited' && { color: colors.success },
                              entry.status === 'cancelled' && { color: colors.error },
                            ]}>
                              {entry.status === 'invited' ? 'Eingeladen' : 'Storniert'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                <TouchableOpacity style={[styles.loadMoreBtn, { marginTop: spacing.lg }]} onPress={loadWaitlist}>
                  <Text style={styles.loadMoreText}>Aktualisieren</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

      </ScrollView>

      {/* === Invite Modal === */}
      <Modal visible={showInviteModal} transparent animationType="fade" onRequestClose={() => setShowInviteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Benutzer einladen</Text>
              <TouchableOpacity onPress={() => setShowInviteModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.inviteHint}>
              Erstellt einen Account und sendet eine Einladungs-E-Mail mit Anweisungen zum Passwort setzen.
            </Text>

            <Text style={styles.fieldLabel}>E-Mail *</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="email@beispiel.ch"
              placeholderTextColor={colors.textLight}
              value={invEmail}
              onChangeText={setInvEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.fieldLabel}>Abo-Stufe</Text>
            <View style={styles.filterRow}>
              {(['free', 'premium'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.filterChip, invTier === t && styles.filterChipActive]}
                  onPress={() => setInvTier(t)}
                >
                  <Text style={[styles.filterText, invTier === t && styles.filterTextActive]}>
                    {t === 'premium' ? 'Premium' : 'Free'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Inspirationen</Text>
            <TextInput
              style={[styles.searchInput, { width: 120 }]}
              value={invCredits}
              onChangeText={setInvCredits}
              keyboardType="number-pad"
            />

            <Text style={styles.fieldLabel}>Notiz</Text>
            <TextInput
              style={[styles.searchInput, { minHeight: 60 }]}
              placeholder="Interne Notiz zum Benutzer..."
              placeholderTextColor={colors.textLight}
              value={invNote}
              onChangeText={setInvNote}
              multiline
            />

            <TouchableOpacity
              style={[styles.inviteBtnLarge, inviting && { opacity: 0.6 }]}
              onPress={handleDirectInvite}
              disabled={inviting || !invEmail.trim()}
            >
              {inviting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.inviteBtnLargeText}>Einladen & E-Mail senden</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* === Waitlist Detail Modal === */}
      <Modal visible={!!selectedEntry} transparent animationType="fade" onRequestClose={() => setSelectedEntry(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {selectedEntry && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {[selectedEntry.first_name, selectedEntry.last_name].filter(Boolean).join(' ') || selectedEntry.email}
                  </Text>
                  <TouchableOpacity onPress={() => setSelectedEntry(null)} style={styles.modalCloseBtn}>
                    <Text style={styles.modalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.detailLabel}>E-Mail</Text>
                <Text style={styles.detailValue}>{selectedEntry.email}</Text>

                <Text style={styles.detailLabel}>Angemeldet</Text>
                <Text style={styles.detailValue}>{formatDate(selectedEntry.created_at)}</Text>

                <Text style={styles.detailLabel}>Status</Text>
                <Text style={styles.detailValue}>
                  {selectedEntry.confirmed ? 'Bestätigt' : 'Unbestätigt'}
                  {selectedEntry.status === 'invited' && ' — Eingeladen'}
                  {selectedEntry.status === 'cancelled' && ' — Storniert'}
                </Text>

                {selectedEntry.referral_source && (
                  <>
                    <Text style={styles.detailLabel}>Quelle</Text>
                    <Text style={styles.detailValue}>{selectedEntry.referral_source}</Text>
                  </>
                )}

                {selectedEntry.user_goal && (
                  <>
                    <Text style={styles.detailLabel}>Ziel / Erwartung</Text>
                    <Text style={styles.detailValue}>{selectedEntry.user_goal}</Text>
                  </>
                )}

                {selectedEntry.status === 'pending' && (
                  <>
                    <Text style={[styles.detailLabel, { marginTop: spacing.md }]}>Kommentar</Text>
                    <TextInput
                      style={styles.noteInput}
                      placeholder="Kommentar (wird zum Profil übernommen)..."
                      placeholderTextColor={colors.textLight}
                      value={entryNotes[selectedEntry.id] ?? selectedEntry.admin_note ?? ''}
                      onChangeText={(t) => setEntryNotes(prev => ({ ...prev, [selectedEntry.id]: t }))}
                      multiline
                    />

                    {actionLoading === selectedEntry.id ? (
                      <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: spacing.md }} />
                    ) : (
                      <View style={[styles.waitlistActions, { marginTop: spacing.md }]}>
                        <TouchableOpacity style={styles.inviteBtnLarge} onPress={() => handleInviteFromWaitlist(selectedEntry)}>
                          <Text style={styles.inviteBtnLargeText}>Einladen & E-Mail senden</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.cancelBtnLarge]} onPress={() => handleCancelWaitlist(selectedEntry)}>
                          <Text style={styles.cancelBtnLargeText}>Stornieren</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}

                {selectedEntry.status !== 'pending' && selectedEntry.admin_note && (
                  <>
                    <Text style={styles.detailLabel}>Kommentar</Text>
                    <Text style={styles.detailValue}>{selectedEntry.admin_note}</Text>
                  </>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </AdminGuard>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, maxWidth: 900, alignSelf: 'center', width: '100%', paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg, gap: spacing.md },
  backBtn: { paddingVertical: spacing.xs, paddingRight: spacing.md },
  backText: { ...typography.body, color: colors.primary },
  title: { ...typography.h1, flex: 1 },

  // Tabs
  tabRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: -1 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText: { ...typography.body, color: colors.textSecondary },
  tabTextActive: { color: colors.primary, fontWeight: '600' },
  tabBadge: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: 'center' },
  tabBadgeText: { ...typography.caption, color: '#FFFFFF', fontWeight: '700', fontSize: 11 },

  // Shared
  searchInput: {
    ...typography.body,
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  filterChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { ...typography.bodySmall, color: colors.textSecondary },
  filterTextActive: { color: '#FFFFFF', fontWeight: '600' },
  loadingText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xxl },
  emptyText: { ...typography.body, color: colors.textLight, textAlign: 'center', marginTop: spacing.xxl },
  tableCard: { backgroundColor: colors.card, borderRadius: borderRadius.lg, ...shadows.md, overflow: 'hidden' },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  sectionLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.sm },
  fieldLabel: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.xs },

  // User rows
  userRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  userInfo: { flex: 1, minWidth: 0 },
  userName: { ...typography.body, fontWeight: '500' },
  userEmail: { ...typography.caption, color: colors.textSecondary },
  tierBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm, backgroundColor: colors.border },
  tierPremium: { backgroundColor: colors.secondary + '20' },
  tierTrialing: { backgroundColor: colors.accent + '20' },
  tierText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  tierTextPremium: { color: colors.secondary },
  tierTextTrialing: { color: colors.accent },
  creditsText: { ...typography.bodySmall, color: colors.accent, fontWeight: '600', minWidth: 30, textAlign: 'center' },
  dateText: { ...typography.caption, color: colors.textLight, minWidth: 75, textAlign: 'right' },
  dateTextSmall: { ...typography.caption, color: colors.textLight, marginTop: 2 },
  arrow: { ...typography.body, color: colors.textLight, marginLeft: spacing.xs },
  loadMoreBtn: { alignSelf: 'center', marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: borderRadius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  loadMoreText: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },

  // Waitlist rows
  waitlistRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  waitlistInfo: { flex: 1, minWidth: 0 },
  noteInput: { ...typography.bodySmall, backgroundColor: colors.background, borderRadius: borderRadius.sm, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, minHeight: 48, textAlignVertical: 'top' },
  waitlistActions: { gap: spacing.sm },
  inviteBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.sm },
  inviteBtnText: { ...typography.caption, color: '#FFFFFF', fontWeight: '600' },
  cancelBtn: { backgroundColor: colors.error + '15', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.sm },
  cancelBtnText: { ...typography.caption, color: colors.error, fontWeight: '600' },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm },
  statusText: { ...typography.caption, fontWeight: '600' },

  // + Button
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { fontSize: 22, color: '#FFFFFF', fontWeight: '600', lineHeight: 24 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  modalCard: { backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.xl, width: '100%', maxWidth: 440, ...shadows.lg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  modalTitle: { ...typography.h3, fontWeight: '700' },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  modalCloseText: { fontSize: 16, color: colors.textSecondary, fontWeight: '600' },

  // Detail modal
  detailLabel: { ...typography.caption, color: colors.textLight, marginTop: spacing.sm },
  detailValue: { ...typography.body, marginTop: 2 },
  cancelBtnLarge: { backgroundColor: colors.error + '15', borderRadius: borderRadius.md, padding: spacing.md, alignItems: 'center' },
  cancelBtnLargeText: { ...typography.button, color: colors.error },

  // Invite form
  inviteHint: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.lg },
  inviteBtnLarge: { backgroundColor: colors.primary, borderRadius: borderRadius.md, padding: spacing.md, alignItems: 'center' },
  inviteBtnLargeText: { ...typography.button, color: '#FFFFFF' },
});
