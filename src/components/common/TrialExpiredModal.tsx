import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { colors, spacing, borderRadius, typography, gradients } from '../../utils/theme';
import { Icon, IconName } from '../../utils/icons';
import { RootStackParamList } from '../../types/navigation';

const LOST_FEATURES: { icon: IconName; text: string }[] = [
  { icon: 'airplane-outline', text: 'Unbegrenzte Reisen' },
  { icon: 'images-outline', text: 'Unbegrenzte Fotos (Free: max. 10/Trip)' },
  { icon: 'wallet-outline', text: 'Budget & Ausgaben' },
  { icon: 'map-outline', text: 'Routen & Stops' },
  { icon: 'sparkles-outline', text: '20 Inspirationen/Monat' },
];

const DISMISSED_KEY = 'wayfable_trial_expired_dismissed';

export const TrialExpiredModal: React.FC = () => {
  const { isTrialExpired } = useSubscription();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISSED_KEY) === 'true'; } catch { return false; }
  });

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, 'true'); } catch {}
  };

  // Reset dismissal if user upgrades and trial is no longer expired
  if (!isTrialExpired && dismissed) {
    try { localStorage.removeItem(DISMISSED_KEY); } catch {}
  }

  if (!isTrialExpired || dismissed) return null;

  return (
    <Modal transparent animationType="fade" visible>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <LinearGradient colors={[...gradients.sunset]} style={styles.gradient}>
            <View style={styles.icon}>
              <Icon name="time-outline" size={48} color="#FFFFFF" />
            </View>
            <Text style={styles.title}>Dein 14-Tage Premium-Test ist abgelaufen</Text>
            <Text style={styles.message}>
              Diese Features stehen dir nicht mehr zur Verfügung:
            </Text>
          </LinearGradient>

          <View style={styles.featureList}>
            {LOST_FEATURES.map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <Icon name={f.icon} size={20} color={colors.error} />
                <Text style={styles.featureText}>{f.text}</Text>
              </View>
            ))}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.upgradeBtn}
              onPress={() => {
                setDismissed(true);
                navigation.navigate('Subscription');
              }}
            >
              <LinearGradient
                colors={[...gradients.ocean]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.upgradeBtnGradient}
              >
                <Text style={styles.upgradeBtnText}>Jetzt Premium sichern — ab CHF 9.90/Mt.</Text>
              </LinearGradient>
            </TouchableOpacity>
            <Text style={styles.keepNote}>Gekaufte Inspirationen bleiben erhalten</Text>
            <TouchableOpacity style={styles.laterBtn} onPress={() => setDismissed(true)}>
              <Text style={styles.laterBtnText}>Später</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    maxWidth: 400,
    width: '100%',
  },
  gradient: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  icon: {
    marginBottom: spacing.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  title: {
    ...typography.h2,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 24,
  },
  featureList: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  featureText: {
    ...typography.body,
    color: colors.text,
  },
  actions: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  upgradeBtn: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  upgradeBtnGradient: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.md,
  },
  upgradeBtnText: {
    ...typography.button,
    color: '#FFFFFF',
  },
  keepNote: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  laterBtn: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  laterBtnText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
