import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdminGuard } from '../../components/admin/AdminGuard';
import { Card, Avatar } from '../../components/common';
import { adminGetStats, adminGetRecentSignups, adminGetRevenueStats } from '../../api/admin';
import { getDisplayName } from '../../utils/profileHelpers';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { Profile, RevenueStats } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'AdminDashboard'> };

export const AdminDashboardScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState({ totalUsers: 0, premiumUsers: 0, totalTrips: 0, totalAiUsage: 0 });
  const [recentUsers, setRecentUsers] = useState<Profile[]>([]);
  const [revenue, setRevenue] = useState<RevenueStats | null>(null);
  const [loading, setLoading] = useState(true);

  const formatCHF = (cents: number) => `CHF ${(cents / 100).toFixed(2)}`;

  useEffect(() => {
    const load = async () => {
      try {
        const [s, r] = await Promise.all([adminGetStats(), adminGetRecentSignups(8)]);
        setStats(s);
        setRecentUsers(r);
        // Load revenue stats in parallel but don't block initial render
        adminGetRevenueStats().then(setRevenue).catch((e) => console.error('Revenue stats error:', e));
      } catch (e) {
        console.error('Admin stats error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const kpis = [
    { label: 'Benutzer', value: stats.totalUsers, color: colors.primary },
    { label: 'Premium', value: stats.premiumUsers, color: colors.secondary },
    { label: 'Reisen', value: stats.totalTrips, color: colors.accent },
    { label: 'AI-Nutzung', value: stats.totalAiUsage, color: colors.sky },
    { label: 'Umsatz (Netto)', value: revenue ? formatCHF(revenue.total_revenue_net) : '...', color: colors.success, isText: true },
    { label: 'MRR', value: revenue ? formatCHF(revenue.mrr) : '...', color: colors.secondary, isText: true },
  ];

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
  };

  return (
    <AdminGuard>
      <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main', { screen: 'Profile' } as any)} style={styles.backBtn}>
            <Text style={styles.backText}>{'<'} Zurück</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Admin Dashboard</Text>
        </View>

        {loading ? (
          <Text style={styles.loadingText}>Laden...</Text>
        ) : (
          <>
            <View style={styles.kpiGrid}>
              {kpis.map((kpi) => (
                <Card key={kpi.label} style={styles.kpiCard}>
                  <Text style={[kpi.isText ? styles.kpiValueText : styles.kpiValue, { color: kpi.color }]}>{kpi.value}</Text>
                  <Text style={styles.kpiLabel}>{kpi.label}</Text>
                </Card>
              ))}
            </View>

            <Card style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Letzte Registrierungen</Text>
                <TouchableOpacity onPress={() => navigation.navigate('AdminUserList')}>
                  <Text style={styles.seeAllText}>Alle Benutzer →</Text>
                </TouchableOpacity>
              </View>
              {recentUsers.map((user) => (
                <TouchableOpacity
                  key={user.id}
                  style={styles.userRow}
                  onPress={() => navigation.navigate('AdminUserDetail', { userId: user.id })}
                >
                  <Avatar uri={user.avatar_url} name={getDisplayName(user)} size={36} />
                  <View style={styles.userInfo}>
                    <Text style={styles.userName} numberOfLines={1}>{getDisplayName(user)}</Text>
                    <Text style={styles.userEmail} numberOfLines={1}>{user.email}</Text>
                  </View>
                  <View style={[styles.tierBadge, user.subscription_tier === 'premium' && styles.tierPremium, user.subscription_status === 'trialing' && styles.tierTrialing]}>
                    <Text style={[styles.tierText, user.subscription_tier === 'premium' && styles.tierTextPremium, user.subscription_status === 'trialing' && styles.tierTextTrialing]}>
                      {user.subscription_status === 'trialing' ? 'Trialing' : user.subscription_tier === 'premium' ? 'Premium' : 'Free'}
                    </Text>
                  </View>
                  <Text style={styles.dateText}>{formatDate(user.created_at)}</Text>
                </TouchableOpacity>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </AdminGuard>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, maxWidth: 900, alignSelf: 'center', width: '100%' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl, gap: spacing.md },
  backBtn: { paddingVertical: spacing.xs, paddingRight: spacing.md },
  backText: { ...typography.body, color: colors.primary },
  title: { ...typography.h1 },
  loadingText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xxl },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  kpiCard: { flex: 1, minWidth: 140, alignItems: 'center', paddingVertical: spacing.lg },
  kpiValue: { fontSize: 32, fontWeight: '700' },
  kpiValueText: { fontSize: 20, fontWeight: '700' },
  kpiLabel: { ...typography.bodySmall, marginTop: spacing.xs },
  sectionCard: { marginBottom: spacing.xl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { ...typography.h3 },
  seeAllText: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  userInfo: { flex: 1, minWidth: 0 },
  userName: { ...typography.body, fontWeight: '500' },
  userEmail: { ...typography.caption, color: colors.textSecondary },
  tierBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm, backgroundColor: colors.border },
  tierPremium: { backgroundColor: colors.secondary + '20' },
  tierTrialing: { backgroundColor: colors.accent + '20' },
  tierText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  tierTextPremium: { color: colors.secondary },
  tierTextTrialing: { color: colors.accent },
  dateText: { ...typography.caption, color: colors.textLight, minWidth: 75, textAlign: 'right' },
});
