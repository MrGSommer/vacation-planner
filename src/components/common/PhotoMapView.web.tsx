import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Photo } from '../../types/database';
import { colors, spacing, typography } from '../../utils/theme';

interface PhotoMapViewProps {
  photos: Photo[];
  onPhotoPress: (photo: Photo) => void;
}

export const PhotoMapView: React.FC<PhotoMapViewProps> = () => (
  <View style={styles.container}>
    <Text style={styles.text}>Kartenansicht ist nur in der App verfügbar</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  text: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
