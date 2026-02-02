import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { colors, spacing, typography, borderRadius, shadows } from '../../utils/theme';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  visible: boolean;
  message: string;
  type?: ToastType;
  duration?: number;
  onDismiss: () => void;
}

const toastColors: Record<ToastType, { bg: string; text: string }> = {
  success: { bg: '#E6F9F1', text: colors.success },
  error: { bg: '#FFEAEA', text: colors.error },
  warning: { bg: '#FFF8E1', text: '#E67E22' },
  info: { bg: '#EBF5FF', text: colors.sky },
};

export const Toast: React.FC<ToastProps> = ({ visible, message, type = 'info', duration = 3000, onDismiss }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(translateY, { toValue: -20, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
        ]).start(() => onDismiss());
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible, duration]);

  if (!visible) return null;

  const c = toastColors[type];

  return (
    <Animated.View style={[styles.container, { opacity, transform: [{ translateY }], backgroundColor: c.bg }]}>
      <TouchableOpacity onPress={onDismiss} activeOpacity={0.8} style={styles.inner}>
        <Text style={[styles.message, { color: c.text }]}>{message}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: spacing.md,
    right: spacing.md,
    borderRadius: borderRadius.md,
    zIndex: 9999,
    ...shadows.md,
  },
  inner: {
    padding: spacing.md,
  },
  message: {
    ...typography.body,
    fontWeight: '500',
    textAlign: 'center',
  },
});
