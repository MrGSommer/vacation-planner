import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '../common/Skeleton';
import { colors, spacing, borderRadius } from '../../utils/theme';

export const EditTripSkeleton: React.FC = () => (
  <View style={styles.container}>
    <View style={styles.progress}>
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={styles.progressItem}>
          <Skeleton width={32} height={32} borderRadius={16} />
          <Skeleton width={50} height={12} borderRadius={4} style={{ marginTop: 4 }} />
        </View>
      ))}
    </View>
    <View style={styles.content}>
      <Skeleton width={140} height={22} borderRadius={4} style={{ marginBottom: spacing.lg }} />
      <Skeleton width={80} height={14} borderRadius={4} style={{ marginBottom: spacing.sm }} />
      <Skeleton width="100%" height={48} borderRadius={borderRadius.md} style={{ marginBottom: spacing.lg }} />
      <Skeleton width={60} height={14} borderRadius={4} style={{ marginBottom: spacing.sm }} />
      <Skeleton width="100%" height={48} borderRadius={borderRadius.md} style={{ marginBottom: spacing.lg }} />
      <Skeleton width={80} height={14} borderRadius={4} style={{ marginBottom: spacing.sm }} />
      <Skeleton width="100%" height={160} borderRadius={borderRadius.lg} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  progress: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: spacing.md,
    gap: spacing.lg,
  },
  progressItem: { alignItems: 'center' },
  content: { padding: spacing.xl },
});
