import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdminGuard } from '../../components/admin/AdminGuard';
import { Avatar } from '../../components/common';
import { adminListUsers } from '../../api/admin';
import { getDisplayName } from '../../utils/profileHelpers';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { Profile } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'AdminUserList'> };

const PAGE_SIZE = 20;

export const AdminUserListScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState<Profile[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<'all' | 'free' | 'premium'>('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

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
      console.error('Admin list users error:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [search, tierFilter, users]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadUsers(true), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, tierFilter]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
  };

  const filters: { label: string; value: 'all' | 'free' | 'premium' }[] = [
    { label: 'Alle', value: 'all' },
    { label: 'Free', value: 'free' },
    { label: 'Premium', value: 'premium' },
  ];

  return (
    <AdminGuard>
      <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('AdminDashboard')} style={styles.backBtn}>
            <Text style={styles.backText}>{'<'} Zurück</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Benutzer</Text>
          <Text style={styles.countText}>{totalCount}</Text>
        </View>

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
                style={[styles.userRow, idx > 0 && styles.userRowBorder]}
                onPress={() => navigation.navigate('AdminUserDetail', { userId: user.id })}
              >
                <Avatar uri={user.avatar_url} name={getDisplayName(user)} size={36} />
                <View style={styles.userInfo}>
                  <Text style={styles.userName} numberOfLines={1}>{getDisplayName(user)}</Text>
                  <Text style={styles.userEmail} numberOfLines={1}>{user.email}</Text>
                </View>
                <View style={[styles.tierBadge, user.subscription_tier === 'premium' && styles.tierPremium]}>
                  <Text style={[styles.tierText, user.subscription_tier === 'premium' && styles.tierTextPremium]}>
                    {user.subscription_tier === 'premium' ? 'Premium' : 'Free'}
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
          <TouchableOpacity
            style={styles.loadMoreBtn}
            onPress={() => loadUsers(false)}
            disabled={loadingMore}
          >
            <Text style={styles.loadMoreText}>
              {loadingMore ? 'Laden...' : 'Mehr laden'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </AdminGuard>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, maxWidth: 900, alignSelf: 'center', width: '100%' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg, gap: spacing.md },
  backBtn: { paddingVertical: spacing.xs, paddingRight: spacing.md },
  backText: { ...typography.body, color: colors.primary },
  title: { ...typography.h1, flex: 1 },
  countText: { ...typography.bodySmall, color: colors.textSecondary, backgroundColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm, overflow: 'hidden' },
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
  userRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  userRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  userInfo: { flex: 1, minWidth: 0 },
  userName: { ...typography.body, fontWeight: '500' },
  userEmail: { ...typography.caption, color: colors.textSecondary },
  tierBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm, backgroundColor: colors.border },
  tierPremium: { backgroundColor: colors.secondary + '20' },
  tierText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  tierTextPremium: { color: colors.secondary },
  creditsText: { ...typography.bodySmall, color: colors.accent, fontWeight: '600', minWidth: 30, textAlign: 'center' },
  dateText: { ...typography.caption, color: colors.textLight, minWidth: 75, textAlign: 'right' },
  arrow: { ...typography.body, color: colors.textLight, marginLeft: spacing.xs },
  loadMoreBtn: { alignSelf: 'center', marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: borderRadius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  loadMoreText: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },
});
