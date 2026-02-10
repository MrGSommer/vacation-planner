import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Avatar } from '../common';
import { CollaboratorWithProfile } from '../../api/invitations';
import { getDisplayName } from '../../utils/profileHelpers';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

interface SplitWithPickerProps {
  collaborators: CollaboratorWithProfile[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export const SplitWithPicker: React.FC<SplitWithPickerProps> = ({
  collaborators,
  selected,
  onChange,
}) => {
  const toggle = (userId: string) => {
    if (selected.includes(userId)) {
      onChange(selected.filter(id => id !== userId));
    } else {
      onChange([...selected, userId]);
    }
  };

  return (
    <View style={styles.container}>
      {collaborators.map(c => {
        const isSelected = selected.includes(c.user_id);
        return (
          <TouchableOpacity
            key={c.user_id}
            style={[styles.item, isSelected && styles.itemSelected]}
            onPress={() => toggle(c.user_id)}
            activeOpacity={0.7}
          >
            <Avatar
              uri={c.profile.avatar_url}
              name={getDisplayName(c.profile)}
              size={32}
            />
            <Text style={[styles.name, isSelected && styles.nameSelected]} numberOfLines={1}>
              {getDisplayName(c.profile)}
            </Text>
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Text style={styles.checkmark}>✓</Text>}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  itemSelected: {
    borderColor: colors.secondary,
    backgroundColor: `${colors.secondary}10`,
  },
  name: { ...typography.bodySmall, flex: 1, color: colors.text },
  nameSelected: { fontWeight: '600' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    borderColor: colors.secondary,
    backgroundColor: colors.secondary,
  },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
