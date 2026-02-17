import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, Alert, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Header } from '../../components/common';
import { useAuth } from '../../hooks/useAuth';
import { updateProfile } from '../../api/auth';
import { isPushSupported, getPushPermission, subscribeToPush, unsubscribeFromPush } from '../../utils/pushManager';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { RootStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

export const NotificationsScreen: React.FC<Props> = ({ navigation }) => {
  const { user, profile, refreshProfile } = useAuth();

  // Master
  const [enabled, setEnabled] = useState(profile?.notifications_enabled ?? true);

  // Push
  const [pushSupported] = useState(isPushSupported());
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushReminders, setPushReminders] = useState(profile?.notification_push_reminders ?? true);
  const [pushCollaborators, setPushCollaborators] = useState(profile?.notification_push_collaborators ?? true);

  // Email
  const [emailEnabled, setEmailEnabled] = useState(profile?.notification_email_enabled ?? true);
  const [emailReminders, setEmailReminders] = useState(profile?.notification_email_reminders ?? true);
  const [emailCollaborators, setEmailCollaborators] = useState(profile?.notification_email_collaborators ?? true);

  const [saving, setSaving] = useState(false);
  const [pushSaving, setPushSaving] = useState(false);

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
      setEmailReminders(profile.notification_email_reminders ?? true);
      setEmailCollaborators(profile.notification_email_collaborators ?? true);
    }
  }, [profile]);

  const savePreference = async (field: string, value: boolean, rollback: () => void) => {
    if (!user) return;
    setSaving(true);
    try {
      await updateProfile(user.id, { [field]: value });
      await refreshProfile();
    } catch {
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
    } catch {
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

  const pushPermission = pushSupported ? getPushPermission() : 'unsupported';
  const pushBlocked = pushPermission === 'denied';
  const masterOff = !enabled;

  return (
    <View style={styles.container}>
      <Header title="Benachrichtigungen" onBack={() => navigation.goBack()} />
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
});
