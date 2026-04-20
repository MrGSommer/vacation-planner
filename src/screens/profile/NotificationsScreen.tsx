import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, Alert, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Header } from '../../components/common';
import { useAuth } from '../../hooks/useAuth';
import { useAdmin } from '../../hooks/useAdmin';
import { updateProfile } from '../../api/auth';
import { isPushSupported, getPushPermission, subscribeToPush, unsubscribeFromPush, refreshPushSubscription } from '../../utils/pushManager';
import { supabase } from '../../api/supabase';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { RootStackParamList } from '../../types/navigation';
import { logError } from '../../services/errorLogger';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

export const NotificationsScreen: React.FC<Props> = ({ navigation }) => {
  const { user, profile, refreshProfile } = useAuth();
  const { isAdmin } = useAdmin();

  // Master
  const [enabled, setEnabled] = useState(profile?.notifications_enabled ?? true);

  // Push
  const [pushSupported] = useState(isPushSupported());
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushReminders, setPushReminders] = useState(profile?.notification_push_reminders ?? true);
  const [pushCollaborators, setPushCollaborators] = useState(profile?.notification_push_collaborators ?? true);
  const [pushFable, setPushFable] = useState(profile?.notification_push_fable ?? true);

  // Email
  const [emailEnabled, setEmailEnabled] = useState(profile?.notification_email_enabled ?? true);
  const [emailReminders, setEmailReminders] = useState(profile?.notification_email_reminders ?? true);
  const [emailCollaborators, setEmailCollaborators] = useState(profile?.notification_email_collaborators ?? true);

  // Admin
  const [adminSignups, setAdminSignups] = useState(profile?.notification_admin_signups ?? true);
  const [adminWaitlist, setAdminWaitlist] = useState(profile?.notification_admin_waitlist ?? true);
  const [adminPremium, setAdminPremium] = useState(profile?.notification_admin_premium ?? true);
  const [adminCancellations, setAdminCancellations] = useState(profile?.notification_admin_cancellations ?? true);
  const [adminFeedback, setAdminFeedback] = useState(profile?.notification_admin_feedback ?? true);

  const [saving, setSaving] = useState(false);
  const [pushSaving, setPushSaving] = useState(false);
  const [testPushLoading, setTestPushLoading] = useState(false);

  useEffect(() => {
    if (pushSupported) {
      setPushEnabled(getPushPermission() === 'granted');
    }
  }, [pushSupported]);

  // Sync state when profile refreshes
  useEffect(() => {
    if (profile) {
      setEnabled(profile.notifications_enabled);
      setEmailEnabled(profile.notification_email_enabled ?? true);
      setPushReminders(profile.notification_push_reminders ?? true);
      setPushCollaborators(profile.notification_push_collaborators ?? true);
      setPushFable(profile.notification_push_fable ?? true);
      setEmailReminders(profile.notification_email_reminders ?? true);
      setEmailCollaborators(profile.notification_email_collaborators ?? true);
      setAdminSignups(profile.notification_admin_signups ?? true);
      setAdminWaitlist(profile.notification_admin_waitlist ?? true);
      setAdminPremium(profile.notification_admin_premium ?? true);
      setAdminCancellations(profile.notification_admin_cancellations ?? true);
      setAdminFeedback(profile.notification_admin_feedback ?? true);
    }
  }, [profile]);

  const handleTestPush = async () => {
    if (!user) return;
    setTestPushLoading(true);
    try {
      // Detect PWA standalone mode
      const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches
        || (window.navigator as any).standalone === true;

      // Check permission in THIS context (browser vs PWA have separate permissions)
      const permission = Notification.permission;

      if (permission !== 'granted') {
        Alert.alert('Push nicht erlaubt', `Notification.permission = "${permission}".\n\n${
          isStandalone
            ? 'PWA und Browser haben separate Berechtigungen. Bitte Push hier erneut aktivieren.'
            : 'Bitte Push-Benachrichtigungen in den Browser-Einstellungen erlauben.'
        }`);
        setTestPushLoading(false);
        return;
      }

      // Refresh subscription
      await refreshPushSubscription(user.id);

      // Check subscription state
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();

      if (!sub) {
        Alert.alert('Keine Subscription', 'Keine aktive Push-Subscription. Bitte Push deaktivieren und erneut aktivieren.');
        setTestPushLoading(false);
        return;
      }

      // Count ALL DB subscriptions for this user (browser + PWA may have separate ones)
      const { data: dbSubs } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint')
        .eq('user_id', user.id);

      const endpointMatch = dbSubs?.some(s => s.endpoint === sub.endpoint);

      const info = [
        `Modus: ${isStandalone ? 'PWA (standalone)' : 'Browser'}`,
        `Permission: ${permission}`,
        `SW: ${registration.active ? 'aktiv' : 'inaktiv'}`,
        `Endpoint: ...${sub.endpoint.slice(-40)}`,
        `DB-Subscriptions: ${dbSubs?.length ?? 0}`,
        `Dieser Endpoint in DB: ${endpointMatch ? 'Ja' : 'NEIN'}`,
        `VAPID: ${(process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY || '').substring(0, 10)}...`,
      ].join('\n');

      // Send local notification (shows even in foreground on most platforms)
      await registration.showNotification('WayFable Test', {
        body: isStandalone ? 'PWA Push funktioniert!' : 'Browser Push funktioniert!',
        icon: '/icon-192.png',
        tag: 'test-push',
      });

      Alert.alert(
        'Push-Diagnose',
        `Test-Notification gesendet.\n\n${info}\n\n${
          !endpointMatch
            ? '⚠️ Endpoint nicht in DB! Push deaktivieren und erneut aktivieren.'
            : 'Wenn keine Notification erscheint: PWA minimieren und erneut versuchen (Foreground-Unterdrückung).'
        }`
      );
    } catch (e: any) {
      logError(e, { component: 'NotificationsScreen', context: { action: 'togglePushNotifications' } });
      Alert.alert('Fehler', `${e.message || 'Test-Push fehlgeschlagen'}\n\nTipp: Push deaktivieren, erneut aktivieren.`);
    } finally {
      setTestPushLoading(false);
    }
  };

  const savePreference = async (field: string, value: boolean, rollback: () => void) => {
    if (!user) return;
    setSaving(true);
    try {
      await updateProfile(user.id, { [field]: value });
      await refreshProfile();
    } catch (e) {
      logError(e, { component: 'NotificationsScreen', context: { action: 'savePreference' } });
      rollback();
      Alert.alert('Fehler', 'Einstellung konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  const handleMasterToggle = (value: boolean) => {
    setEnabled(value);
    savePreference('notifications_enabled', value, () => setEnabled(!value));
  };

  const handlePushToggle = async (value: boolean) => {
    if (!user) return;
    setPushSaving(true);
    try {
      if (value) {
        const success = await subscribeToPush(user.id);
        setPushEnabled(success);
        if (!success) {
          Alert.alert('Hinweis', 'Push-Benachrichtigungen konnten nicht aktiviert werden. Prüfe deine Browser-Einstellungen.');
        }
      } else {
        await unsubscribeFromPush(user.id);
        setPushEnabled(false);
      }
    } catch (e) {
      logError(e, { component: 'NotificationsScreen', context: { action: 'handlePushToggle' } });
      Alert.alert('Fehler', 'Push-Einstellung konnte nicht gespeichert werden.');
    } finally {
      setPushSaving(false);
    }
  };

  const handleEmailToggle = (value: boolean) => {
    setEmailEnabled(value);
    savePreference('notification_email_enabled', value, () => setEmailEnabled(!value));
  };

  const handlePushReminders = (value: boolean) => {
    setPushReminders(value);
    savePreference('notification_push_reminders', value, () => setPushReminders(!value));
  };

  const handlePushCollaborators = (value: boolean) => {
    setPushCollaborators(value);
    savePreference('notification_push_collaborators', value, () => setPushCollaborators(!value));
  };

  const handleEmailReminders = (value: boolean) => {
    setEmailReminders(value);
    savePreference('notification_email_reminders', value, () => setEmailReminders(!value));
  };

  const handleEmailCollaborators = (value: boolean) => {
    setEmailCollaborators(value);
    savePreference('notification_email_collaborators', value, () => setEmailCollaborators(!value));
  };

  const handlePushFable = (value: boolean) => {
    setPushFable(value);
    savePreference('notification_push_fable', value, () => setPushFable(!value));
  };

  const handleAdminSignups = (value: boolean) => {
    setAdminSignups(value);
    savePreference('notification_admin_signups', value, () => setAdminSignups(!value));
  };
  const handleAdminWaitlist = (value: boolean) => {
    setAdminWaitlist(value);
    savePreference('notification_admin_waitlist', value, () => setAdminWaitlist(!value));
  };
  const handleAdminPremium = (value: boolean) => {
    setAdminPremium(value);
    savePreference('notification_admin_premium', value, () => setAdminPremium(!value));
  };
  const handleAdminCancellations = (value: boolean) => {
    setAdminCancellations(value);
    savePreference('notification_admin_cancellations', value, () => setAdminCancellations(!value));
  };
  const handleAdminFeedback = (value: boolean) => {
    setAdminFeedback(value);
    savePreference('notification_admin_feedback', value, () => setAdminFeedback(!value));
  };

  const pushPermission = pushSupported ? getPushPermission() : 'unsupported';
  const pushBlocked = pushPermission === 'denied';
  const masterOff = !enabled;

  return (
    <View style={styles.container}>
      <Header title="Benachrichtigungen" onBack={() => navigation.canGoBack() ? navigation.goBack() : (navigation as any).navigate('Profile')} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        {/* Master toggle */}
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>Benachrichtigungen</Text>
              <Text style={styles.rowDesc}>Alle Benachrichtigungen ein- oder ausschalten</Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={handleMasterToggle}
              disabled={saving}
              trackColor={{ false: colors.border, true: colors.primary + '80' }}
              thumbColor={enabled ? colors.primary : colors.textLight}
            />
          </View>
        </View>

        {/* Push Section */}
        {pushSupported && (
          <>
            <Text style={[styles.sectionTitle, masterOff && styles.sectionTitleDisabled]}>
              Push-Benachrichtigungen
            </Text>
            <View style={[styles.card, masterOff && styles.cardDisabled]}>
              {/* Push master */}
              <View style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowLabel, masterOff && styles.textDisabled]}>Push aktivieren</Text>
                  <Text style={[styles.rowDesc, masterOff && styles.textDisabled]}>
                    {pushBlocked
                      ? 'Push wurde im Browser blockiert. Ändere dies in deinen Browser-Einstellungen.'
                      : 'Benachrichtigungen direkt im Browser anzeigen'}
                  </Text>
                </View>
                <Switch
                  value={pushEnabled}
                  onValueChange={handlePushToggle}
                  disabled={pushSaving || pushBlocked || masterOff}
                  trackColor={{ false: colors.border, true: colors.sky + '80' }}
                  thumbColor={pushEnabled && !masterOff ? colors.sky : colors.textLight}
                />
              </View>

              {/* Push sub-toggles */}
              <View style={styles.divider} />
              <View style={styles.subRow}>
                <View style={styles.rowInfo}>
                  <Text style={[styles.subLabel, (masterOff || !pushEnabled) && styles.textDisabled]}>
                    Reise-Erinnerungen
                  </Text>
                  <Text style={[styles.subDesc, (masterOff || !pushEnabled) && styles.textDisabled]}>
                    3 Tage und 1 Tag vor Reisebeginn
                  </Text>
                </View>
                <Switch
                  value={pushReminders}
                  onValueChange={handlePushReminders}
                  disabled={saving || masterOff || !pushEnabled}
                  trackColor={{ false: colors.border, true: colors.sky + '80' }}
                  thumbColor={pushReminders && pushEnabled && !masterOff ? colors.sky : colors.textLight}
                />
              </View>

              <View style={styles.subRow}>
                <View style={styles.rowInfo}>
                  <Text style={[styles.subLabel, (masterOff || !pushEnabled) && styles.textDisabled]}>
                    Mitreisende-Updates
                  </Text>
                  <Text style={[styles.subDesc, (masterOff || !pushEnabled) && styles.textDisabled]}>
                    Wenn jemand deiner Reise beitritt
                  </Text>
                </View>
                <Switch
                  value={pushCollaborators}
                  onValueChange={handlePushCollaborators}
                  disabled={saving || masterOff || !pushEnabled}
                  trackColor={{ false: colors.border, true: colors.sky + '80' }}
                  thumbColor={pushCollaborators && pushEnabled && !masterOff ? colors.sky : colors.textLight}
                />
              </View>

              <View style={styles.subRow}>
                <View style={styles.rowInfo}>
                  <Text style={[styles.subLabel, (masterOff || !pushEnabled) && styles.textDisabled]}>
                    Fable-Benachrichtigungen
                  </Text>
                  <Text style={[styles.subDesc, (masterOff || !pushEnabled) && styles.textDisabled]}>
                    Wenn Fable einen Reiseplan im Hintergrund fertiggestellt hat
                  </Text>
                </View>
                <Switch
                  value={pushFable}
                  onValueChange={handlePushFable}
                  disabled={saving || masterOff || !pushEnabled}
                  trackColor={{ false: colors.border, true: colors.sky + '80' }}
                  thumbColor={pushFable && pushEnabled && !masterOff ? colors.sky : colors.textLight}
                />
              </View>

              {/* Test Push Button */}
              {pushEnabled && !masterOff && (
                <>
                  <View style={styles.divider} />
                  <TouchableOpacity
                    style={styles.testPushButton}
                    onPress={handleTestPush}
                    disabled={testPushLoading}
                    activeOpacity={0.7}
                  >
                    {testPushLoading ? (
                      <ActivityIndicator size="small" color={colors.sky} />
                    ) : (
                      <Text style={styles.testPushText}>Test-Push senden</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </>
        )}

        {/* Email Section */}
        <Text style={[styles.sectionTitle, masterOff && styles.sectionTitleDisabled]}>
          E-Mail-Benachrichtigungen
        </Text>
        <View style={[styles.card, masterOff && styles.cardDisabled]}>
          {/* Email master */}
          <View style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={[styles.rowLabel, masterOff && styles.textDisabled]}>E-Mails aktivieren</Text>
              <Text style={[styles.rowDesc, masterOff && styles.textDisabled]}>
                Benachrichtigungen per E-Mail erhalten
              </Text>
            </View>
            <Switch
              value={emailEnabled}
              onValueChange={handleEmailToggle}
              disabled={saving || masterOff}
              trackColor={{ false: colors.border, true: colors.primary + '80' }}
              thumbColor={emailEnabled && !masterOff ? colors.primary : colors.textLight}
            />
          </View>

          {/* Email sub-toggles */}
          <View style={styles.divider} />
          <View style={styles.subRow}>
            <View style={styles.rowInfo}>
              <Text style={[styles.subLabel, (masterOff || !emailEnabled) && styles.textDisabled]}>
                Reise-Erinnerungen
              </Text>
              <Text style={[styles.subDesc, (masterOff || !emailEnabled) && styles.textDisabled]}>
                3 Tage und 1 Tag vor Reisebeginn
              </Text>
            </View>
            <Switch
              value={emailReminders}
              onValueChange={handleEmailReminders}
              disabled={saving || masterOff || !emailEnabled}
              trackColor={{ false: colors.border, true: colors.primary + '80' }}
              thumbColor={emailReminders && emailEnabled && !masterOff ? colors.primary : colors.textLight}
            />
          </View>

          <View style={styles.subRow}>
            <View style={styles.rowInfo}>
              <Text style={[styles.subLabel, (masterOff || !emailEnabled) && styles.textDisabled]}>
                Mitreisende-Updates
              </Text>
              <Text style={[styles.subDesc, (masterOff || !emailEnabled) && styles.textDisabled]}>
                Wenn jemand deiner Reise beitritt
              </Text>
            </View>
            <Switch
              value={emailCollaborators}
              onValueChange={handleEmailCollaborators}
              disabled={saving || masterOff || !emailEnabled}
              trackColor={{ false: colors.border, true: colors.primary + '80' }}
              thumbColor={emailCollaborators && emailEnabled && !masterOff ? colors.primary : colors.textLight}
            />
          </View>
        </View>

        {/* Admin Section */}
        {isAdmin && (
          <>
            <Text style={[styles.sectionTitle, masterOff && styles.sectionTitleDisabled]}>
              Admin-Benachrichtigungen
            </Text>
            <View style={[styles.card, masterOff && styles.cardDisabled]}>
              {[
                { label: 'Neue Registrierungen', desc: 'Wenn sich ein neuer User registriert', value: adminSignups, handler: handleAdminSignups },
                { label: 'Waitlist-Einträge', desc: 'Wenn jemand sich auf die Warteliste setzt', value: adminWaitlist, handler: handleAdminWaitlist },
                { label: 'Premium-Abschluss', desc: 'Wenn jemand Premium abschliesst', value: adminPremium, handler: handleAdminPremium },
                { label: 'Premium-Kündigung', desc: 'Wenn jemand Premium kündigt', value: adminCancellations, handler: handleAdminCancellations },
                { label: 'Neues Feedback', desc: 'Wenn ein User Feedback sendet', value: adminFeedback, handler: handleAdminFeedback },
              ].map((item, i) => (
                <View key={item.label}>
                  {i > 0 && <View style={styles.subDivider} />}
                  <View style={i === 0 ? styles.row : styles.subRow}>
                    <View style={styles.rowInfo}>
                      <Text style={[i === 0 ? styles.rowLabel : styles.subLabel, masterOff && styles.textDisabled]}>{item.label}</Text>
                      <Text style={[i === 0 ? styles.rowDesc : styles.subDesc, masterOff && styles.textDisabled]}>{item.desc}</Text>
                    </View>
                    <Switch
                      value={item.value}
                      onValueChange={item.handler}
                      disabled={saving || masterOff}
                      trackColor={{ false: colors.border, true: colors.accent + '80' }}
                      thumbColor={item.value && !masterOff ? colors.accent : colors.textLight}
                    />
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Info box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoIcon}>💡</Text>
          <Text style={styles.infoText}>
            Kombiniere Push- und E-Mail-Benachrichtigungen, um keine wichtigen Reise-Updates zu verpassen.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl + spacing.xl },
  sectionTitle: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  sectionTitleDisabled: {
    opacity: 0.4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    marginTop: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
    marginHorizontal: -spacing.xs,
  },
  rowInfo: { flex: 1, marginRight: spacing.md },
  rowLabel: { ...typography.body, fontWeight: '600', marginBottom: spacing.xs },
  rowDesc: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },
  subLabel: { ...typography.bodySmall, fontWeight: '600', marginBottom: 2 },
  subDesc: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  textDisabled: {
    color: colors.textLight,
  },
  subDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
    marginLeft: spacing.md,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: colors.sky + '10',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  infoIcon: { fontSize: 16, marginTop: 2 },
  infoText: { ...typography.bodySmall, color: colors.textSecondary, flex: 1, lineHeight: 22 },
  testPushButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  testPushText: {
    ...typography.bodySmall,
    color: colors.sky,
    fontWeight: '600',
  },
});
