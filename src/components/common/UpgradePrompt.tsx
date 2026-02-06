import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../types/navigation';
import { colors, spacing, borderRadius, typography, shadows, gradients } from '../../utils/theme';

interface UpgradePromptProps {
  icon?: string;
  title: string;
  message: string;
  inline?: boolean;
  /** Show "Inspirationen kaufen" instead of upgrade button */
  buyInspirations?: boolean;
}

export const UpgradePrompt: React.FC<UpgradePromptProps> = ({
  icon = '🔒',
  title,
  message,
  inline = false,
  buyInspirations = false,
}) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handlePress = () => {
    if (buyInspirations) {
      navigation.navigate('Subscription');
    } else {
      navigation.navigate('Subscription');
    }
  };

  if (inline) {
    return (
      <TouchableOpacity
        style={styles.inlineCard}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={buyInspirations ? [...gradients.sunset] : [...gradients.ocean]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.inlineGradient}
        >
          <Text style={styles.inlineIcon}>{icon}</Text>
          <View style={styles.inlineInfo}>
            <Text style={styles.inlineTitle}>{title}</Text>
            <Text style={styles.inlineMessage}>{message}</Text>
          </View>
          <Text style={styles.inlineArrow}>{'›'}</Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <TouchableOpacity
        style={styles.upgradeButton}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={buyInspirations ? [...gradients.sunset] : [...gradients.ocean]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.upgradeGradient}
        >
          <Text style={styles.upgradeText}>
            {buyInspirations ? 'Inspirationen kaufen' : 'Upgrade auf Premium'}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  icon: { fontSize: 48, marginBottom: spacing.md },
  title: { ...typography.h2, textAlign: 'center', marginBottom: spacing.sm },
  message: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  upgradeButton: { borderRadius: borderRadius.lg, overflow: 'hidden', ...shadows.sm },
  upgradeGradient: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  upgradeText: { ...typography.button, color: '#FFFFFF' },
  inlineCard: { borderRadius: borderRadius.lg, overflow: 'hidden', ...shadows.sm },
  inlineGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  inlineIcon: { fontSize: 24, marginRight: spacing.md },
  inlineInfo: { flex: 1 },
  inlineTitle: { ...typography.body, fontWeight: '600', color: '#FFFFFF' },
  inlineMessage: { ...typography.caption, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  inlineArrow: { fontSize: 24, color: 'rgba(255,255,255,0.7)' },
});
