import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '../common/Skeleton';
import { colors, spacing, borderRadius } from '../../utils/theme';

export const ItinerarySkeleton: React.FC = () => (
  <View style={styles.container}>
    <View style={styles.tabRow}>
      {[0, 1, 2, 3, 4].map(i => (
        <Skeleton key={i} width={72} height={48} borderRadius={borderRadius.md} />
      ))}
    </View>
    <View style={styles.timeline}>
      {[0, 1, 2].map(i => (
        <View key={i} style={styles.activityRow}>
          <View style={styles.timelineCol}>
            <Skeleton width={12} height={12} borderRadius={6} />
            {i < 2 && <View style={styles.connector} />}
          </View>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Skeleton width={24} height={24} borderRadius={12} />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Skeleton width="60%" height={16} borderRadius={4} />
                <Skeleton width={40} height={12} borderRadius={4} style={{ marginTop: 4 }} />
              </View>
            </View>
            <Skeleton width="80%" height={12} borderRadius={4} style={{ marginTop: spacing.sm }} />
          </View>
        </View>
      ))}
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  timeline: { padding: spacing.md },
  activityRow: { flexDirection: 'row', marginBottom: spacing.md },
  timelineCol: { width: 24, alignItems: 'center' },
  connector: { width: 2, flex: 1, backgroundColor: colors.border, marginTop: 4 },
  card: {
    flex: 1,
    marginLeft: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
});
