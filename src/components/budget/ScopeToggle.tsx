import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

interface ScopeToggleProps {
  scope: 'group' | 'personal';
  onChange: (scope: 'group' | 'personal') => void;
}

export const ScopeToggle: React.FC<ScopeToggleProps> = ({ scope, onChange }) => (
  <View style={styles.container}>
    <TouchableOpacity
      style={[styles.option, scope === 'group' && styles.active]}
      onPress={() => onChange('group')}
      activeOpacity={0.7}
    >
      <Text style={[styles.label, scope === 'group' && styles.activeLabel]}>Gruppe</Text>
    </TouchableOpacity>
    <TouchableOpacity
      style={[styles.option, scope === 'personal' && styles.active]}
      onPress={() => onChange('personal')}
      activeOpacity={0.7}
    >
      <Text style={[styles.label, scope === 'personal' && styles.activeLabel]}>Persönlich</Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    borderRadius: borderRadius.full,
    padding: 3,
    marginBottom: spacing.md,
  },
  option: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    borderRadius: borderRadius.full,
  },
  active: {
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  label: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  activeLabel: {
    color: colors.text,
  },
});
