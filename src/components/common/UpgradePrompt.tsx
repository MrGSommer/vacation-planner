import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../types/navigation';
import { colors, spacing, borderRadius, typography, shadows, gradients, iconSize } from '../../utils/theme';
import { Icon, IconName } from '../../utils/icons';

interface FeatureHighlight {
  icon: IconName;
  text: string;
}

interface UpgradePromptProps {
  iconName?: IconName;
  title: string;
  message: string;
  inline?: boolean;
  /** Show "Inspirationen kaufen" instead of upgrade button */
  buyInspirations?: boolean;
  /** Feature highlights shown as benefit list */
  highlights?: FeatureHighlight[];
}

export const UpgradePrompt: React.FC<UpgradePromptProps> = ({
  iconName = 'lock-closed-outline',
  title,
  message,
  inline = false,
  buyInspirations = false,
  highlights,
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
          <View style={styles.inlineIcon}>
            <Icon name={iconName} size={iconSize.md} color="#FFFFFF" />
          </View>
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
      <View style={styles.icon}>
        <Icon name={iconName} size={48} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {highlights && highlights.length > 0 && (
        <View style={styles.highlights}>
          {highlights.map((h, i) => (
            <View key={i} style={styles.highlightRow}>
              <Icon name={h.icon} size={iconSize.sm} color={colors.secondary} />
              <Text style={styles.highlightText}>{h.text}</Text>
            </View>
          ))}
        </View>
      )}
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
  icon: { marginBottom: spacing.md, alignItems: 'center' as const },
  title: { ...typography.h2, textAlign: 'center', marginBottom: spacing.sm },
  message: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
  highlights: { marginBottom: spacing.xl, width: '100%', maxWidth: 280 },
  highlightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  highlightText: { ...typography.bodySmall, color: colors.text, flex: 1 },
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
  inlineIcon: { marginRight: spacing.md, justifyContent: 'center' as const },
  inlineInfo: { flex: 1 },
  inlineTitle: { ...typography.body, fontWeight: '600', color: '#FFFFFF' },
  inlineMessage: { ...typography.caption, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  inlineArrow: { fontSize: 24, color: 'rgba(255,255,255,0.7)' },
});
