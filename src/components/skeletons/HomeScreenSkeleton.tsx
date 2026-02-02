import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '../common/Skeleton';
import { spacing, borderRadius } from '../../utils/theme';

const TripCardSkeleton = () => (
  <View style={styles.card}>
    <View style={styles.cardTop}>
      <Skeleton width={80} height={24} borderRadius={borderRadius.full} />
      <Skeleton width={24} height={24} borderRadius={12} />
    </View>
    <View style={styles.cardBottom}>
      <Skeleton width="60%" height={20} borderRadius={4} />
      <Skeleton width="40%" height={16} borderRadius={4} style={{ marginTop: 6 }} />
      <Skeleton width="50%" height={12} borderRadius={4} style={{ marginTop: 6 }} />
    </View>
  </View>
);

export const HomeScreenSkeleton: React.FC = () => (
  <View style={styles.container}>
    {[0, 1, 2].map(i => (
      <TripCardSkeleton key={i} />
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.md },
  card: {
    height: 200,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    justifyContent: 'space-between',
    backgroundColor: '#F0F0F0',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between' },
  cardBottom: {},
});
