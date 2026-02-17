import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, Alert, Platform } from 'react-native';
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
  const [enabled, setEnabled] = useState(profile?.notifications_enabled ?? true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported] = useState(isPushSupported());
  const [saving, setSaving] = useState(false);
  const [pushSaving, setPushSaving] = useState(false);

  useEffect(() => {
    if (pushSupported) {
      setPushEnabled(getPushPermission() === 'granted');
    }
  }, [pushSupported]);

  const handleToggle = async (value: boolean) => {
    if (!user) return;
    setEnabled(value);
    setSaving(true);
    try {
      await updateProfile(user.id, { notifications_enabled: value });
      await refreshProfile();
    } catch {
      setEnabled(!value);
      Alert.alert('Fehler', 'Einstellung konnte nicht gespeichert werden');
    } finally {
      setSaving(false);
    }
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
      Alert.alert('Fehler', 'Push-Einstellung konnte nicht gespeichert werden');
    } finally {
      setPushSaving(false);
    }
  };

  const pushPermission = pushSupported ? getPushPermission() : 'unsupported';
  const pushBlocked = pushPermission === 'denied';

  return (
    <View style={styles.container}>
      <Header title="Benachrichtigungen" onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        {/* Master toggle */}
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>Benachrichtigungen</Text>
              <Text style={styles.rowDesc}>Erhalte Erinnerungen vor Reisen und Updates von Mitreisenden</Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={handleToggle}
              disabled={saving}
              trackColor={{ false: colors.border, true: colors.primary + '80' }}
              thumbColor={enabled ? colors.primary : colors.textLight}
            />
          </View>
        </View>

        {/* Push Notifications */}
        {pushSupported && (
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>Push-Benachrichtigungen</Text>
                <Text style={styles.rowDesc}>
                  {pushBlocked
                    ? 'Push wurde im Browser blockiert. Ändere dies in deinen Browser-Einstellungen.'
                    : 'Benachrichtigungen direkt im Browser anzeigen'}
                </Text>
              </View>
              <Switch
                value={pushEnabled}
                onValueChange={handlePushToggle}
                disabled={pushSaving || pushBlocked || !enabled}
                trackColor={{ false: colors.border, true: colors.sky + '80' }}
                thumbColor={pushEnabled ? colors.sky : colors.textLight}
              />
            </View>
          </View>
        )}

        {/* Email Notifications info */}
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>E-Mail-Benachrichtigungen</Text>
              <Text style={styles.rowDesc}>
                {enabled
                  ? 'Du erhältst E-Mails vor Reisebeginn und bei Änderungen an deinen Reisen.'
                  : 'Aktiviere Benachrichtigungen oben, um E-Mails zu erhalten.'}
              </Text>
            </View>
            <Text style={styles.statusIcon}>{enabled ? '✅' : '⏸️'}</Text>
          </View>
        </View>

        {/* Info box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoIcon}>💡</Text>
          <Text style={styles.infoText}>
            Du wirst benachrichtigt wenn:{'\n'}
            {'\u2022'} Eine Reise in 3 Tagen oder morgen startet{'\n'}
            {'\u2022'} Jemand deiner Reise beitritt{'\n'}
            {'\u2022'} Neue Aktivitäten hinzugefügt werden
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowInfo: { flex: 1, marginRight: spacing.md },
  rowLabel: { ...typography.body, fontWeight: '600', marginBottom: spacing.xs },
  rowDesc: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },
  statusIcon: { fontSize: 20 },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: colors.sky + '10',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  infoIcon: { fontSize: 16, marginTop: 2 },
  infoText: { ...typography.bodySmall, color: colors.textSecondary, flex: 1, lineHeight: 22 },
});
