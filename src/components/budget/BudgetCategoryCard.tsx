import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card } from '../common';
import { Icon } from '../../utils/icons';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

interface BudgetCategoryCardProps {
  name: string;
  color: string;
  spent: number;
  budgetLimit: number | null;
  personalLimit?: number | null;
  currency: string;
  scope?: 'group' | 'personal';
  onEdit?: () => void;
  onDelete?: () => void;
  onSetPersonalLimit?: () => void;
}

export const BudgetCategoryCard: React.FC<BudgetCategoryCardProps> = ({
  name,
  color,
  spent,
  budgetLimit,
  personalLimit,
  currency,
  scope = 'group',
  onEdit,
  onDelete,
  onSetPersonalLimit,
}) => {
  const effectiveLimit = (budgetLimit || 0) + (personalLimit || 0);
  const hasLimit = effectiveLimit > 0;
  const progress = hasLimit ? Math.min(spent / effectiveLimit, 1) : 0;
  const overBudget = hasLimit && spent > effectiveLimit;
  const isPersonal = scope === 'personal';

  // For the group bar (without personal limit)
  const groupProgress = budgetLimit && budgetLimit > 0 ? Math.min((budgetLimit / effectiveLimit), 1) : 0;

  return (
    <TouchableOpacity onPress={onEdit} onLongPress={onDelete} activeOpacity={0.7}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          {isPersonal && (
            <Icon name="lock-closed-outline" size={14} color={colors.textLight} style={{ marginRight: 4 }} />
          )}
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={[styles.amount, overBudget && styles.overBudget]}>
            {currency} {spent.toFixed(0)}
            {hasLimit ? ` / ${effectiveLimit.toFixed(0)}` : ''}
          </Text>
        </View>

        {hasLimit && (
          <View style={styles.barTrack}>
            {/* Personal limit marker: show where group limit ends */}
            {personalLimit != null && personalLimit > 0 && budgetLimit != null && budgetLimit > 0 && (
              <View style={[styles.groupMarker, { left: `${groupProgress * 100}%` }]} />
            )}
            <View
              style={[
                styles.barFill,
                {
                  width: `${progress * 100}%`,
                  backgroundColor: overBudget ? colors.error : color,
                },
              ]}
            />
          </View>
        )}

        {/* Personal limit info or add button */}
        {scope === 'group' && (
          <View style={styles.personalRow}>
            {personalLimit != null && personalLimit > 0 ? (
              <TouchableOpacity onPress={onSetPersonalLimit} activeOpacity={0.7} style={styles.personalInfo}>
                <Icon name="person-outline" size={12} color={colors.secondary} />
                <Text style={styles.personalText}>
                  +{currency} {personalLimit.toFixed(0)} persönlich
                </Text>
              </TouchableOpacity>
            ) : onSetPersonalLimit ? (
              <TouchableOpacity onPress={onSetPersonalLimit} activeOpacity={0.7} style={styles.personalInfo}>
                <Icon name="add-outline" size={12} color={colors.textLight} />
                <Text style={styles.addPersonalText}>Mein Limit</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm, paddingVertical: spacing.sm + 4 },
  header: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  name: { ...typography.body, fontWeight: '600', flex: 1 },
  amount: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  overBudget: { color: colors.error },
  barTrack: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    marginTop: spacing.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: { height: 6, borderRadius: 3 },
  groupMarker: {
    position: 'absolute',
    top: -1,
    width: 2,
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.25)',
    zIndex: 1,
  },
  personalRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  personalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  personalText: {
    ...typography.caption,
    color: colors.secondary,
    fontWeight: '500',
  },
  addPersonalText: {
    ...typography.caption,
    color: colors.textLight,
  },
});
