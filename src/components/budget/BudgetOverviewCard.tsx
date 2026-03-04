import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from '../common';
import { BudgetDonutChart } from './BudgetDonutChart';
import { colors, spacing, typography } from '../../utils/theme';

interface CategoryData {
  name: string;
  color: string;
  spent: number;
}

interface BudgetOverviewCardProps {
  totalBudget: number;
  totalSpent: number;
  currency: string;
  categories?: CategoryData[];
}

export const BudgetOverviewCard: React.FC<BudgetOverviewCardProps> = ({
  totalBudget,
  totalSpent,
  currency,
  categories,
}) => {
  const remaining = totalBudget - totalSpent;
  const overBudget = remaining < 0;
  const hasCategories = categories && categories.some(c => c.spent > 0);

  return (
    <Card style={styles.card}>
      {hasCategories && (
        <BudgetDonutChart
          categories={categories!}
          totalSpent={totalSpent}
          totalBudget={totalBudget}
          currency={currency}
        />
      )}
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
  card: { marginBottom: spacing.sm, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  col: { flex: 1, alignItems: 'center' },
  divider: { width: 1, height: 28, backgroundColor: colors.border },
  label: { ...typography.caption, marginBottom: 2 },
  value: { ...typography.bodySmall, fontWeight: '700' },
  spent: { color: colors.primary },
  remaining: { color: colors.success },
  overBudget: { color: colors.error },
});
