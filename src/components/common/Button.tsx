import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius, typography, gradients } from '../../utils/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const Button: React.FC<ButtonProps> = ({
  title, onPress, variant = 'primary', loading = false, disabled = false, style,
}) => {
  const isDisabled = disabled || loading;

  if (variant === 'primary') {
    return (
      <TouchableOpacity onPress={onPress} disabled={isDisabled} style={[styles.wrapper, style]} activeOpacity={0.8}>
        <LinearGradient colors={[gradients.sunset[0], gradients.sunset[2]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.button, isDisabled && styles.disabled]}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{title}</Text>}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      style={[styles.button, variant === 'secondary' ? styles.secondary : styles.ghost, isDisabled && styles.disabled, style]}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <Text style={[styles.text, variant === 'secondary' ? styles.secondaryText : styles.ghostText]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  wrapper: {},
  button: {
    height: 52,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  disabled: { opacity: 0.5 },
  primaryText: { ...typography.button, color: '#FFFFFF' },
  secondary: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  secondaryText: { ...typography.button, color: colors.primary },
  ghost: { backgroundColor: 'transparent' },
  ghostText: { ...typography.button, color: colors.primary },
  text: { ...typography.button },
});
