import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { colors, spacing, borderRadius, typography, gradients } from '../../utils/theme';
import { RootStackParamList } from '../../types/navigation';

export const TrialExpiredModal: React.FC = () => {
  const { isTrialExpired } = useSubscription();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [dismissed, setDismissed] = useState(false);

  if (!isTrialExpired || dismissed) return null;

  return (
    <Modal transparent animationType="fade" visible>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <LinearGradient colors={[...gradients.ocean]} style={styles.gradient}>
            <Text style={styles.icon}>{'~'}</Text>
            <Text style={styles.title}>Testzeitraum abgelaufen</Text>
            <Text style={styles.message}>
              Dein Premium-Testzeitraum ist leider abgelaufen. Abonniere WayFable Premium, um weiterhin alle Funktionen zu nutzen.
            </Text>
          </LinearGradient>
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
                <Text style={styles.upgradeBtnText}>Jetzt upgraden</Text>
              </LinearGradient>
            </TouchableOpacity>
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
    fontSize: 48,
    marginBottom: spacing.md,
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
  actions: {
    padding: spacing.lg,
    gap: spacing.sm,
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
  laterBtn: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  laterBtnText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
