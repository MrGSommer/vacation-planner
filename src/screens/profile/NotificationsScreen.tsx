import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Header } from '../../components/common';
import { useAuth } from '../../hooks/useAuth';
import { updateProfile } from '../../api/auth';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { RootStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

export const NotificationsScreen: React.FC<Props> = ({ navigation }) => {
  const { user, profile, refreshProfile } = useAuth();
  const [enabled, setEnabled] = useState(profile?.notifications_enabled ?? true);
  const [saving, setSaving] = useState(false);

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

  return (
    <View style={styles.container}>
      <Header title="Benachrichtigungen" onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowLabel}>Benachrichtigungen</Text>
            <Text style={styles.rowDesc}>Erhalte Hinweise zu Einladungen und Änderungen an deinen Reisen</Text>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  rowInfo: { flex: 1, marginRight: spacing.md },
  rowLabel: { ...typography.body, fontWeight: '600', marginBottom: spacing.xs },
  rowDesc: { ...typography.bodySmall, color: colors.textSecondary },
});
