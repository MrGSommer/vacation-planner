import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '../common/Skeleton';
import { colors, spacing, borderRadius } from '../../utils/theme';

export const BudgetSkeleton: React.FC = () => (
  <View style={styles.container}>
    <View style={styles.summaryCard}>
      <Skeleton width={120} height={14} borderRadius={4} />
      <Skeleton width={100} height={32} borderRadius={4} style={{ marginTop: spacing.sm }} />
    </View>
    <View style={styles.chartCard}>
      <Skeleton width={120} height={18} borderRadius={4} style={{ marginBottom: spacing.md }} />
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={styles.barRow}>
          <Skeleton width={80} height={12} borderRadius={4} />
          <View style={{ flex: 1, marginHorizontal: spacing.sm }}>
            <Skeleton width="50%" height={8} borderRadius={4} />
          </View>
          <Skeleton width={60} height={12} borderRadius={4} />
        </View>
      ))}
    </View>
    <Skeleton width={80} height={18} borderRadius={4} style={{ marginBottom: spacing.md }} />
    {[0, 1, 2].map(i => (
      <View key={i} style={styles.expenseCard}>
        <View style={{ flex: 1 }}>
          <Skeleton width="60%" height={16} borderRadius={4} />
          <Skeleton width={80} height={12} borderRadius={4} style={{ marginTop: 4 }} />
        </View>
        <Skeleton width={70} height={16} borderRadius={4} />
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: { padding: spacing.md },
  summaryCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  chartCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
});
