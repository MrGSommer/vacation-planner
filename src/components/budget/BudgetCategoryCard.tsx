import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card } from '../common';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

interface BudgetCategoryCardProps {
  name: string;
  color: string;
  spent: number;
  budgetLimit: number | null;
  currency: string;
  onEdit: () => void;
  onDelete: () => void;
}

export const BudgetCategoryCard: React.FC<BudgetCategoryCardProps> = ({
  name,
  color,
  spent,
  budgetLimit,
  currency,
  onEdit,
  onDelete,
}) => {
  const progress = budgetLimit && budgetLimit > 0 ? Math.min(spent / budgetLimit, 1) : 0;
  const overBudget = budgetLimit != null && spent > budgetLimit;

  return (
    <TouchableOpacity onPress={onEdit} onLongPress={onDelete} activeOpacity={0.7}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={[styles.amount, overBudget && styles.overBudget]}>
            {currency} {spent.toFixed(0)}
            {budgetLimit != null ? ` / ${budgetLimit.toFixed(0)}` : ''}
          </Text>
        </View>
        {budgetLimit != null && budgetLimit > 0 && (
          <View style={styles.barTrack}>
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
  },
  barFill: { height: 6, borderRadius: 3 },
});
