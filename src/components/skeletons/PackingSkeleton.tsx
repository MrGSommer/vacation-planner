import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '../common/Skeleton';
import { colors, spacing } from '../../utils/theme';

export const PackingSkeleton: React.FC = () => (
  <View style={styles.container}>
    <View style={styles.progress}>
      <Skeleton width="100%" height={8} borderRadius={4} />
      <Skeleton width={120} height={12} borderRadius={4} style={{ marginTop: spacing.xs, alignSelf: 'center' }} />
    </View>
    {[0, 1].map(cat => (
      <View key={cat} style={styles.section}>
        <Skeleton width={100} height={18} borderRadius={4} style={{ marginBottom: spacing.sm }} />
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={styles.itemRow}>
            <Skeleton width={24} height={24} borderRadius={6} />
            <Skeleton width="60%" height={16} borderRadius={4} style={{ marginLeft: spacing.md }} />
          </View>
        ))}
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: { padding: spacing.md },
  progress: { marginBottom: spacing.lg },
  section: { marginBottom: spacing.lg },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
