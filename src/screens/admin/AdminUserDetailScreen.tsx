import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdminGuard } from '../../components/admin/AdminGuard';
import { Card, Avatar } from '../../components/common';
import { adminGetUser, adminUpdateUser, adminGetUserTrips, adminGetUserAiUsage } from '../../api/admin';
import { getDisplayName } from '../../utils/profileHelpers';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { Profile, Trip, AiUsageLog } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminUserDetail'>;

export const AdminUserDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { userId } = route.params;
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [aiLogs, setAiLogs] = useState<AiUsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [editTier, setEditTier] = useState<'free' | 'premium'>('free');
  const [editStatus, setEditStatus] = useState<'active' | 'canceled' | 'past_due' | 'trialing'>('active');
  const [editCredits, setEditCredits] = useState('0');
  const [editIsAdmin, setEditIsAdmin] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [p, t, a] = await Promise.all([
          adminGetUser(userId),
          adminGetUserTrips(userId),
          adminGetUserAiUsage(userId),
        ]);
        setProfile(p);
        setTrips(t);
        setAiLogs(a);
        setEditTier(p.subscription_tier);
        setEditStatus(p.subscription_status);
        setEditCredits(String(p.ai_credits_balance));
        setEditIsAdmin(p.is_admin);
      } catch (e) {
        console.error('Admin get user error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  const handleSave = async () => {
    const doSave = async () => {
      setSaving(true);
      try {
        const updated = await adminUpdateUser(userId, {
          subscription_tier: editTier,
          subscription_status: editStatus,
          ai_credits_balance: parseInt(editCredits, 10) || 0,
          is_admin: editIsAdmin,
        });
        setProfile(updated);
      } catch (e: any) {
        const msg = e?.message || 'Speichern fehlgeschlagen';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Fehler', msg);
      } finally {
        setSaving(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Änderungen speichern?')) await doSave();
    } else {
      Alert.alert('Bestätigen', 'Änderungen speichern?', [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Speichern', onPress: doSave },
      ]);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
  };

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return `${formatDate(iso)} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const totalCreditsUsed = aiLogs.reduce((sum, log) => sum + log.credits_charged, 0);

  const tiers: ('free' | 'premium')[] = ['free', 'premium'];
  const statuses: ('active' | 'canceled' | 'past_due' | 'trialing')[] = ['active', 'canceled', 'past_due', 'trialing'];

  if (loading) {
    return (
      <AdminGuard>
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <Text style={styles.loadingText}>Laden...</Text>
        </View>
      </AdminGuard>
    );
  }

  if (!profile) {
    return (
      <AdminGuard>
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <Text style={styles.loadingText}>Benutzer nicht gefunden</Text>
        </View>
      </AdminGuard>
    );
  }

  return (
    <AdminGuard>
      <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>{'<'} Zurück</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Benutzer</Text>
        </View>

        {/* Profile Header */}
        <Card style={styles.profileCard}>
          <View style={styles.profileRow}>
            <Avatar uri={profile.avatar_url} name={getDisplayName(profile)} size={56} />
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{getDisplayName(profile)}</Text>
              <Text style={styles.profileEmail}>{profile.email}</Text>
              <Text style={styles.profileDate}>Registriert: {formatDate(profile.created_at)}</Text>
            </View>
          </View>
        </Card>

        {/* Subscription & Credits */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Abonnement & Credits</Text>

          <Text style={styles.fieldLabel}>Tier</Text>
          <View style={styles.pickerRow}>
            {tiers.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.pickerOption, editTier === t && styles.pickerActive]}
                onPress={() => setEditTier(t)}
              >
                <Text style={[styles.pickerText, editTier === t && styles.pickerTextActive]}>
                  {t === 'premium' ? 'Premium' : 'Free'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Status</Text>
          <View style={styles.pickerRow}>
            {statuses.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.pickerOption, editStatus === s && styles.pickerActive]}
                onPress={() => setEditStatus(s)}
              >
                <Text style={[styles.pickerText, editStatus === s && styles.pickerTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Inspirationen</Text>
          <TextInput
            style={styles.creditsInput}
            value={editCredits}
            onChangeText={setEditCredits}
            keyboardType="number-pad"
          />

          {profile.stripe_customer_id && (
            <Text style={styles.stripeId}>Stripe: {profile.stripe_customer_id}</Text>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Speichern...' : 'Speichern'}</Text>
          </TouchableOpacity>
        </Card>

        {/* Trips */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Reisen ({trips.length})</Text>
          {trips.length === 0 ? (
            <Text style={styles.emptyText}>Keine Reisen</Text>
          ) : (
            trips.map((trip) => (
              <View key={trip.id} style={styles.tripRow}>
                <View style={styles.tripInfo}>
                  <Text style={styles.tripName} numberOfLines={1}>{trip.name}</Text>
                  <Text style={styles.tripDest} numberOfLines={1}>{trip.destination}</Text>
                </View>
                <View style={[styles.statusBadge, trip.status === 'completed' && { backgroundColor: colors.success + '20' }]}>
                  <Text style={[styles.statusText, trip.status === 'completed' && { color: colors.success }]}>{trip.status}</Text>
                </View>
                <Text style={styles.tripDate}>{formatDate(trip.start_date)}</Text>
              </View>
            ))
          )}
        </Card>

        {/* AI Usage */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>AI-Nutzung</Text>
          <View style={styles.aiSummaryRow}>
            <Text style={styles.aiSummaryLabel}>Total verbraucht:</Text>
            <Text style={styles.aiSummaryValue}>{totalCreditsUsed} Inspirationen</Text>
          </View>
          {aiLogs.length === 0 ? (
            <Text style={styles.emptyText}>Keine AI-Nutzung</Text>
          ) : (
            aiLogs.slice(0, 20).map((log) => (
              <View key={log.id} style={styles.logRow}>
                <Text style={styles.logType}>{log.task_type}</Text>
                <Text style={styles.logCredits}>-{log.credits_charged}</Text>
                <Text style={styles.logDate}>{formatDateTime(log.created_at)}</Text>
              </View>
            ))
          )}
        </Card>

        {/* Actions */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Aktionen</Text>
          <View style={styles.actionRow}>
            <Text style={styles.actionLabel}>Admin-Rechte</Text>
            <TouchableOpacity
              style={[styles.toggleBtn, editIsAdmin && styles.toggleActive]}
              onPress={() => setEditIsAdmin(!editIsAdmin)}
            >
              <Text style={[styles.toggleText, editIsAdmin && styles.toggleTextActive]}>
                {editIsAdmin ? 'Aktiv' : 'Inaktiv'}
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.resetCreditsBtn}
            onPress={() => setEditCredits('0')}
          >
            <Text style={styles.resetCreditsText}>Credits zurücksetzen</Text>
          </TouchableOpacity>
          <Text style={styles.actionHint}>Änderungen werden erst mit "Speichern" übernommen</Text>
        </Card>
      </ScrollView>
    </AdminGuard>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, maxWidth: 900, alignSelf: 'center', width: '100%', paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl, gap: spacing.md },
  backBtn: { paddingVertical: spacing.xs, paddingRight: spacing.md },
  backText: { ...typography.body, color: colors.primary },
  title: { ...typography.h1 },
  loadingText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xxl },
  profileCard: { marginBottom: spacing.lg },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  profileInfo: { flex: 1 },
  profileName: { ...typography.h3 },
  profileEmail: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  profileDate: { ...typography.caption, color: colors.textLight, marginTop: 2 },
  sectionCard: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.h3, marginBottom: spacing.md },
  fieldLabel: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pickerOption: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.sm, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  pickerActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pickerText: { ...typography.bodySmall, color: colors.textSecondary },
  pickerTextActive: { color: '#FFFFFF', fontWeight: '600' },
  creditsInput: {
    ...typography.body,
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    width: 120,
  },
  stripeId: { ...typography.caption, color: colors.textLight, marginTop: spacing.sm },
  saveBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  saveBtnText: { ...typography.button, color: '#FFFFFF' },
  emptyText: { ...typography.bodySmall, color: colors.textLight },
  tripRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  tripInfo: { flex: 1, minWidth: 0 },
  tripName: { ...typography.body, fontWeight: '500' },
  tripDest: { ...typography.caption, color: colors.textSecondary },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm, backgroundColor: colors.border },
  statusText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  tripDate: { ...typography.caption, color: colors.textLight },
  aiSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  aiSummaryLabel: { ...typography.bodySmall, color: colors.textSecondary },
  aiSummaryValue: { ...typography.bodySmall, fontWeight: '600', color: colors.accent },
  logRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  logType: { ...typography.caption, flex: 1 },
  logCredits: { ...typography.caption, color: colors.error, fontWeight: '600' },
  logDate: { ...typography.caption, color: colors.textLight },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  actionLabel: { ...typography.body },
  toggleBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.sm, backgroundColor: colors.border },
  toggleActive: { backgroundColor: colors.success + '20' },
  toggleText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  toggleTextActive: { color: colors.success },
  resetCreditsBtn: { paddingVertical: spacing.sm },
  resetCreditsText: { ...typography.bodySmall, color: colors.error },
  actionHint: { ...typography.caption, color: colors.textLight, marginTop: spacing.xs },
});
