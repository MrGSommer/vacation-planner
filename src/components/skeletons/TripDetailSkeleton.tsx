import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '../common/Skeleton';
import { colors, spacing, borderRadius, shadows } from '../../utils/theme';

export const TripDetailSkeleton: React.FC = () => (
  <View style={styles.container}>
    <Skeleton width="100%" height={220} borderRadius={0} />
    <View style={styles.content}>
      <View style={styles.statsRow}>
        {[0, 1, 2].map(i => (
          <View key={i} style={styles.stat}>
            <Skeleton width={40} height={28} borderRadius={4} />
            <Skeleton width={60} height={12} borderRadius={4} style={{ marginTop: 4 }} />
          </View>
        ))}
      </View>
      <View style={styles.card}>
        <Skeleton width={28} height={28} borderRadius={14} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Skeleton width={60} height={16} borderRadius={4} />
          <Skeleton width={160} height={12} borderRadius={4} style={{ marginTop: 4 }} />
        </View>
      </View>
      <Skeleton width="100%" height={200} borderRadius={borderRadius.lg} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, marginTop: -spacing.lg },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  stat: { flex: 1, alignItems: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
});
