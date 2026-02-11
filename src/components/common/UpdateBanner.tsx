import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { useServiceWorkerUpdate } from '../../hooks/useServiceWorkerUpdate';

export const UpdateBanner: React.FC = () => {
  const { updateAvailable, applyUpdate } = useServiceWorkerUpdate();

  if (Platform.OS !== 'web' || !updateAvailable) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Eine neue Version ist verfügbar.</Text>
      <TouchableOpacity style={styles.button} onPress={applyUpdate}>
        <Text style={styles.buttonText}>Aktualisieren</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  text: {
    ...typography.bodySmall,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  buttonText: {
    ...typography.bodySmall,
    color: colors.accent,
    fontWeight: '700',
  },
});
