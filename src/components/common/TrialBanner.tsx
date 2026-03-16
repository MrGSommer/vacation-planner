import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { RootStackParamList } from '../../types/navigation';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { Icon } from '../../utils/icons';

export const TrialBanner: React.FC = () => {
  const { isTrialing, trialDaysLeft } = useSubscription();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  if (!isTrialing) return null;

  const isUrgent = trialDaysLeft <= 3;
  const gradientColors = isUrgent
    ? ['#FF6B6B', '#FF8B94'] as const
    : ['#4ECDC4', '#6C5CE7'] as const;

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('Subscription')}
      activeOpacity={0.8}
      style={styles.container}
    >
      <LinearGradient
        colors={[...gradientColors]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        <Icon name="sparkles" size={20} color="#FFFFFF" />
        <View style={styles.textWrap}>
          <Text style={styles.title}>
            {trialDaysLeft === 0
              ? 'Premium-Test endet heute!'
              : `Premium-Test: Noch ${trialDaysLeft} ${trialDaysLeft === 1 ? 'Tag' : 'Tage'}`}
          </Text>
          <Text style={styles.subtitle}>
            {trialDaysLeft === 0 ? 'Sichere dir jetzt Premium!' : isUrgent ? 'Jetzt Premium sichern!' : 'Alle Features freigeschaltet'}
          </Text>
        </View>
        <Icon name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  textWrap: { flex: 1 },
  title: {
    ...typography.body,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  subtitle: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
});
