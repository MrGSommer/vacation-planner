import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '../common/Skeleton';
import { colors, spacing, borderRadius } from '../../utils/theme';

export const BudgetSkeleton: React.FC = () => (
  <View style={styles.container}>
    {/* Scope Toggle */}
    <View style={styles.toggleRow}>
      <Skeleton width="48%" height={36} borderRadius={borderRadius.full} />
      <Skeleton width="48%" height={36} borderRadius={borderRadius.full} />
    </View>

    {/* Tab Bar */}
    <View style={styles.tabBar}>
      <Skeleton width="45%" height={14} borderRadius={4} />
      <Skeleton width="45%" height={14} borderRadius={4} />
    </View>

    {/* Overview Card */}
    <View style={styles.overviewCard}>
      <View style={styles.overviewRow}>
        <View style={styles.overviewCol}>
          <Skeleton width={60} height={12} borderRadius={4} />
          <Skeleton width={70} height={20} borderRadius={4} style={{ marginTop: spacing.xs }} />
        </View>
        <View style={styles.overviewCol}>
          <Skeleton width={70} height={12} borderRadius={4} />
          <Skeleton width={70} height={20} borderRadius={4} style={{ marginTop: spacing.xs }} />
        </View>
        <View style={styles.overviewCol}>
          <Skeleton width={70} height={12} borderRadius={4} />
          <Skeleton width={70} height={20} borderRadius={4} style={{ marginTop: spacing.xs }} />
        </View>
      </View>
    </View>

    {/* Category Cards */}
    {[0, 1, 2, 3].map(i => (
      <View key={i} style={styles.catCard}>
        <View style={styles.catRow}>
          <Skeleton width={10} height={10} borderRadius={5} />
          <Skeleton width="50%" height={16} borderRadius={4} style={{ marginLeft: spacing.sm }} />
          <View style={{ flex: 1 }} />
          <Skeleton width={80} height={14} borderRadius={4} />
        </View>
        <Skeleton width="60%" height={6} borderRadius={3} style={{ marginTop: spacing.sm }} />
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: { padding: spacing.md },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  overviewCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  overviewRow: { flexDirection: 'row', justifyContent: 'space-between' },
  overviewCol: { alignItems: 'center', flex: 1 },
  catCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
