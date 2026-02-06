import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from '../common';
import { colors, spacing, typography } from '../../utils/theme';

interface BudgetOverviewCardProps {
  totalBudget: number;
  totalSpent: number;
  currency: string;
}

export const BudgetOverviewCard: React.FC<BudgetOverviewCardProps> = ({
  totalBudget,
  totalSpent,
  currency,
}) => {
  const remaining = totalBudget - totalSpent;
  const overBudget = remaining < 0;

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>Budget</Text>
          <Text style={styles.value}>
            {totalBudget > 0 ? `${currency} ${totalBudget.toFixed(0)}` : '–'}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.col}>
          <Text style={styles.label}>Ausgegeben</Text>
          <Text style={[styles.value, styles.spent]}>{currency} {totalSpent.toFixed(0)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.col}>
          <Text style={styles.label}>Verbleibend</Text>
          <Text style={[styles.value, overBudget ? styles.overBudget : styles.remaining]}>
            {totalBudget > 0 ? `${currency} ${remaining.toFixed(0)}` : '–'}
          </Text>
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center' },
  col: { flex: 1, alignItems: 'center' },
  divider: { width: 1, height: 36, backgroundColor: colors.border },
  label: { ...typography.caption, marginBottom: 4 },
  value: { ...typography.h3 },
  spent: { color: colors.primary },
  remaining: { color: colors.success },
  overBudget: { color: colors.error },
});
