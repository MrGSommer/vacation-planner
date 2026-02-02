import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Skeleton } from '../common/Skeleton';
import { spacing, borderRadius } from '../../utils/theme';

const { width } = Dimensions.get('window');
const PHOTO_SIZE = (width - spacing.md * 4) / 3;

export const PhotosSkeleton: React.FC = () => (
  <View style={styles.grid}>
    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => (
      <View key={i} style={styles.photoWrapper}>
        <Skeleton width={PHOTO_SIZE} height={PHOTO_SIZE} borderRadius={borderRadius.sm} />
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.md },
  photoWrapper: { margin: spacing.xs },
});
