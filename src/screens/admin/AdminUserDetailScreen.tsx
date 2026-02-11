import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, Alert, Linking } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdminGuard } from '../../components/admin/AdminGuard';
import { Card, Avatar } from '../../components/common';
import {
  adminGetUser, adminUpdateUser, adminGetUserTrips, adminGetUserAiUsage,
  adminGetUserBilling, adminGetUserInvoices, adminGetUserSubscription, adminGrantTrial,
} from '../../api/admin';
import { getDisplayName } from '../../utils/profileHelpers';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { Profile, Trip, AiUsageLog, StripeCharge, StripeInvoice, StripeSubscriptionDetail } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminUserDetail'>;

const formatCHF = (cents: number) => `CHF ${(cents / 100).toFixed(2)}`;

const formatUnixDate = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
};

const subStatusLabel: Record<string, string> = {
  active: 'Aktiv',
  trialing: 'Trial',
  canceled: 'Gekündigt',
  past_due: 'Überfällig',
  incomplete: 'Unvollständig',
  unpaid: 'Unbezahlt',
};

const invoiceStatusLabel: Record<string, string> = {
  paid: 'Bezahlt',
  open: 'Offen',
  void: 'Storniert',
  draft: 'Entwurf',
  uncollectible: 'Uneinbringlich',
};

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

  // Stripe data (lazy loaded)
  const [stripeSub, setStripeSub] = useState<StripeSubscriptionDetail | null>(null);
  const [stripeCharges, setStripeCharges] = useState<StripeCharge[]>([]);
  const [stripeTotals, setStripeTotals] = useState<{ gross: number; fees: number; net: number } | null>(null);
  const [stripeInvoices, setStripeInvoices] = useState<StripeInvoice[]>([]);
  const [stripeLoading, setStripeLoading] = useState(false);

  // Trial
  const [trialDays, setTrialDays] = useState('14');
  const [grantingTrial, setGrantingTrial] = useState(false);

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

  // Lazy-load Stripe data when profile is available and has stripe_customer_id
  useEffect(() => {
    if (!profile?.stripe_customer_id) return;
    const loadStripe = async () => {
      setStripeLoading(true);
      try {
        const promises: Promise<any>[] = [
          adminGetUserBilling(profile.stripe_customer_id!),
          adminGetUserInvoices(profile.stripe_customer_id!),
        ];
        if (profile.stripe_subscription_id) {
          promises.push(adminGetUserSubscription(profile.stripe_subscription_id));
        }
        const results = await Promise.all(promises);
        setStripeCharges(results[0].charges);
        setStripeTotals(results[0].totals);
        setStripeInvoices(results[1].invoices);
        if (results[2]) setStripeSub(results[2].subscription);
      } catch (e) {
        console.error('Stripe data load error:', e);
      } finally {
        setStripeLoading(false);
      }
    };
    loadStripe();
  }, [profile?.stripe_customer_id, profile?.stripe_subscription_id]);

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

  const handleGrantTrial = async () => {
    const days = parseInt(trialDays, 10);
    if (!days || days < 1 || days > 365) {
      const msg = 'Bitte 1-365 Tage eingeben';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Fehler', msg);
      return;
    }

    const doGrant = async () => {
      setGrantingTrial(true);
      try {
        await adminGrantTrial(userId, days);
        // Reload profile to reflect changes
        const updated = await adminGetUser(userId);
        setProfile(updated);
        setEditTier(updated.subscription_tier);
        setEditStatus(updated.subscription_status);
        const msg = `Trial für ${days} Tage vergeben`;
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Erfolg', msg);
      } catch (e: any) {
        const msg = e?.message || 'Trial konnte nicht vergeben werden';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Fehler', msg);
      } finally {
        setGrantingTrial(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Trial für ${days} Tage vergeben?`)) await doGrant();
    } else {
      Alert.alert('Trial vergeben', `${days} Tage Premium-Trial für diesen Benutzer?`, [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Vergeben', onPress: doGrant },
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

  const planLabel = stripeSub
    ? `Premium ${stripeSub.plan_interval === 'year' ? 'Jährlich' : 'Monatlich'} — ${formatCHF(stripeSub.plan_amount)}/${stripeSub.plan_interval === 'year' ? 'Jahr' : 'Monat'}`
    : null;

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
            blurOnSubmit
            onSubmitEditing={() => {}}
            returnKeyType="done"
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

        {/* Stripe Subscription Details */}
        {profile.stripe_customer_id && (
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Stripe Abonnement</Text>
            {stripeLoading ? (
              <Text style={styles.emptyText}>Laden...</Text>
            ) : stripeSub ? (
              <>
                {planLabel && <Text style={styles.planLabel}>{planLabel}</Text>}
                <View style={styles.stripeDetailRow}>
                  <Text style={styles.stripeDetailLabel}>Status</Text>
                  <View style={[
                    styles.statusBadge,
                    stripeSub.status === 'active' && { backgroundColor: colors.success + '20' },
                    stripeSub.status === 'trialing' && { backgroundColor: colors.accent + '20' },
                    stripeSub.status === 'canceled' && { backgroundColor: colors.error + '20' },
                  ]}>
                    <Text style={[
                      styles.statusText,
                      stripeSub.status === 'active' && { color: colors.success },
                      stripeSub.status === 'trialing' && { color: colors.accent },
                      stripeSub.status === 'canceled' && { color: colors.error },
                    ]}>
                      {subStatusLabel[stripeSub.status] || stripeSub.status}
                    </Text>
                  </View>
                </View>
                <View style={styles.stripeDetailRow}>
                  <Text style={styles.stripeDetailLabel}>Aktuelle Periode</Text>
                  <Text style={styles.stripeDetailValue}>
                    {formatUnixDate(stripeSub.current_period_start)} — {formatUnixDate(stripeSub.current_period_end)}
                  </Text>
                </View>
                {stripeSub.cancel_at_period_end && (
                  <Text style={styles.cancelWarning}>Kündigung zum Periodenende</Text>
                )}
                {stripeSub.trial_end && (
                  <View style={styles.stripeDetailRow}>
                    <Text style={styles.stripeDetailLabel}>Trial bis</Text>
                    <Text style={styles.stripeDetailValue}>{formatUnixDate(stripeSub.trial_end)}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.stripeLinkBtn}
                  onPress={() => Linking.openURL(`https://dashboard.stripe.com/customers/${profile.stripe_customer_id}`)}
                >
                  <Text style={styles.stripeLinkText}>Im Stripe Dashboard öffnen</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.emptyText}>Kein aktives Stripe-Abonnement</Text>
            )}
          </Card>
        )}

        {/* Revenue / Charges */}
        {profile.stripe_customer_id && (
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Umsatz</Text>
            {stripeLoading ? (
              <Text style={styles.emptyText}>Laden...</Text>
            ) : stripeTotals ? (
              <>
                <View style={styles.revenueSummary}>
                  <View style={styles.revenueSummaryItem}>
                    <Text style={styles.revenueSummaryLabel}>Brutto</Text>
                    <Text style={styles.revenueSummaryValue}>{formatCHF(stripeTotals.gross)}</Text>
                  </View>
                  <View style={styles.revenueSummaryItem}>
                    <Text style={styles.revenueSummaryLabel}>Gebühren</Text>
                    <Text style={[styles.revenueSummaryValue, { color: colors.error }]}>-{formatCHF(stripeTotals.fees)}</Text>
                  </View>
                  <View style={styles.revenueSummaryItem}>
                    <Text style={styles.revenueSummaryLabel}>Netto</Text>
                    <Text style={[styles.revenueSummaryValue, { color: colors.success }]}>{formatCHF(stripeTotals.net)}</Text>
                  </View>
                </View>
                {stripeCharges.length === 0 ? (
                  <Text style={styles.emptyText}>Keine Zahlungen</Text>
                ) : (
                  stripeCharges.map((ch) => (
                    <View key={ch.id} style={styles.chargeRow}>
                      <Text style={styles.chargeDate}>{formatUnixDate(ch.created)}</Text>
                      <Text style={styles.chargeAmount}>{formatCHF(ch.amount)}</Text>
                      <Text style={styles.chargeFee}>-{formatCHF(ch.fee)}</Text>
                      <Text style={styles.chargeNet}>{formatCHF(ch.net)}</Text>
                      <View style={[
                        styles.statusBadge,
                        ch.status === 'succeeded' && { backgroundColor: colors.success + '20' },
                        ch.status === 'failed' && { backgroundColor: colors.error + '20' },
                      ]}>
                        <Text style={[
                          styles.statusText,
                          ch.status === 'succeeded' && { color: colors.success },
                          ch.status === 'failed' && { color: colors.error },
                        ]}>
                          {ch.status === 'succeeded' ? 'OK' : ch.status}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </>
            ) : (
              <Text style={styles.emptyText}>Keine Umsatzdaten</Text>
            )}
          </Card>
        )}

        {/* Invoices */}
        {profile.stripe_customer_id && (
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Rechnungen</Text>
            {stripeLoading ? (
              <Text style={styles.emptyText}>Laden...</Text>
            ) : stripeInvoices.length === 0 ? (
              <Text style={styles.emptyText}>Keine Rechnungen</Text>
            ) : (
              stripeInvoices.map((inv) => (
                <View key={inv.id} style={styles.invoiceRow}>
                  <Text style={styles.invoiceNumber}>{inv.number || '—'}</Text>
                  <Text style={styles.invoiceDate}>{formatUnixDate(inv.created)}</Text>
                  <Text style={styles.invoiceAmount}>{formatCHF(inv.amount_paid || inv.amount_due)}</Text>
                  <View style={[
                    styles.statusBadge,
                    inv.status === 'paid' && { backgroundColor: colors.success + '20' },
                    inv.status === 'open' && { backgroundColor: colors.accent + '20' },
                    inv.status === 'void' && { backgroundColor: colors.error + '20' },
                  ]}>
                    <Text style={[
                      styles.statusText,
                      inv.status === 'paid' && { color: colors.success },
                      inv.status === 'open' && { color: colors.accent },
                      inv.status === 'void' && { color: colors.error },
                    ]}>
                      {invoiceStatusLabel[inv.status] || inv.status}
                    </Text>
                  </View>
                  {inv.invoice_pdf && (
                    <TouchableOpacity onPress={() => Linking.openURL(inv.invoice_pdf!)}>
                      <Text style={styles.pdfLink}>PDF</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </Card>
        )}

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

          {/* Trial grant */}
          <View style={styles.trialSection}>
            <Text style={styles.trialTitle}>Trial vergeben</Text>
            <View style={styles.trialRow}>
              <TextInput
                style={styles.trialInput}
                value={trialDays}
                onChangeText={setTrialDays}
                keyboardType="number-pad"
                placeholder="Tage"
                blurOnSubmit
                returnKeyType="done"
              />
              <Text style={styles.trialDaysLabel}>Tage</Text>
              <TouchableOpacity
                style={[styles.trialBtn, grantingTrial && { opacity: 0.6 }]}
                onPress={handleGrantTrial}
                disabled={grantingTrial}
              >
                <Text style={styles.trialBtnText}>{grantingTrial ? 'Vergeben...' : 'Trial vergeben'}</Text>
              </TouchableOpacity>
            </View>
          </View>

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

  // Stripe subscription section
  planLabel: { ...typography.body, fontWeight: '600', marginBottom: spacing.sm },
  stripeDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs },
  stripeDetailLabel: { ...typography.bodySmall, color: colors.textSecondary },
  stripeDetailValue: { ...typography.bodySmall, fontWeight: '500' },
  cancelWarning: { ...typography.bodySmall, color: colors.error, fontWeight: '600', marginTop: spacing.xs },
  stripeLinkBtn: { marginTop: spacing.md },
  stripeLinkText: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },

  // Revenue section
  revenueSummary: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  revenueSummaryItem: { alignItems: 'center' },
  revenueSummaryLabel: { ...typography.caption, color: colors.textSecondary, marginBottom: 2 },
  revenueSummaryValue: { ...typography.body, fontWeight: '700' },
  chargeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  chargeDate: { ...typography.caption, color: colors.textLight, minWidth: 75 },
  chargeAmount: { ...typography.caption, fontWeight: '500', minWidth: 70, textAlign: 'right' },
  chargeFee: { ...typography.caption, color: colors.error, minWidth: 60, textAlign: 'right' },
  chargeNet: { ...typography.caption, color: colors.success, fontWeight: '600', minWidth: 70, textAlign: 'right', flex: 1 },

  // Invoice section
  invoiceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  invoiceNumber: { ...typography.caption, flex: 1, minWidth: 0 },
  invoiceDate: { ...typography.caption, color: colors.textLight, minWidth: 75 },
  invoiceAmount: { ...typography.caption, fontWeight: '500', minWidth: 70, textAlign: 'right' },
  pdfLink: { ...typography.caption, color: colors.primary, fontWeight: '600' },

  // Trial section
  trialSection: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  trialTitle: { ...typography.bodySmall, fontWeight: '600', marginBottom: spacing.sm },
  trialRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trialInput: {
    ...typography.body,
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    width: 70,
    textAlign: 'center',
  },
  trialDaysLabel: { ...typography.bodySmall, color: colors.textSecondary },
  trialBtn: { backgroundColor: colors.accent, borderRadius: borderRadius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  trialBtnText: { ...typography.bodySmall, color: '#FFFFFF', fontWeight: '600' },
});
