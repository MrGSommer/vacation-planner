import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '../common/Skeleton';
import { colors, spacing, borderRadius } from '../../utils/theme';

export const StopsSkeleton: React.FC = () => (
  <View style={styles.container}>
    {[0, 1, 2].map(i => (
      <View key={i}>
        {i > 0 && (
          <View style={styles.travelBadge}>
            <Skeleton width={120} height={24} borderRadius={borderRadius.full} />
          </View>
        )}
        <View style={styles.card}>
          <Skeleton width={28} height={28} borderRadius={14} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Skeleton width="50%" height={16} borderRadius={4} />
            <Skeleton width="70%" height={12} borderRadius={4} style={{ marginTop: 4 }} />
            <Skeleton width={80} height={12} borderRadius={4} style={{ marginTop: 4 }} />
          </View>
        </View>
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: { padding: spacing.md },
  travelBadge: { alignItems: 'center', marginVertical: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
});
