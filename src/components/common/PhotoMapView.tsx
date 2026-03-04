import React from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Image } from 'expo-image';
import { Photo } from '../../types/database';
import { borderRadius, shadows } from '../../utils/theme';

interface PhotoMapViewProps {
  photos: Photo[];
  onPhotoPress: (photo: Photo) => void;
}

export const PhotoMapView: React.FC<PhotoMapViewProps> = ({ photos, onPhotoPress }) => {
  if (photos.length === 0) return null;

  return (
    <MapView
      style={styles.map}
      initialRegion={{
        latitude: photos[0].lat!,
        longitude: photos[0].lng!,
        latitudeDelta: Math.max(
          0.05,
          photos.length > 1
            ? (Math.max(...photos.map(p => p.lat!)) - Math.min(...photos.map(p => p.lat!))) * 1.5
            : 0.05,
        ),
        longitudeDelta: Math.max(
          0.05,
          photos.length > 1
            ? (Math.max(...photos.map(p => p.lng!)) - Math.min(...photos.map(p => p.lng!))) * 1.5
            : 0.05,
        ),
      }}
    >
      {photos.map(photo => (
        <Marker
          key={photo.id}
          coordinate={{ latitude: photo.lat!, longitude: photo.lng! }}
          onPress={() => onPhotoPress(photo)}
        >
          <View style={styles.marker}>
            <Image
              source={{ uri: photo.thumbnail_url || photo.url }}
              style={styles.markerImage}
            />
          </View>
        </Marker>
      ))}
    </MapView>
  );
};

const styles = StyleSheet.create({
  map: { flex: 1 },
  marker: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    ...shadows.sm,
  },
  markerImage: { width: '100%', height: '100%' },
});
