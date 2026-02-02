import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, Modal, Dimensions, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Header, EmptyState } from '../../components/common';
import { getPhotos, uploadPhoto, deletePhoto } from '../../api/photos';
import { Photo } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { useAuthContext } from '../../contexts/AuthContext';
import { formatDate } from '../../utils/dateHelpers';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Photos'>;

const { width } = Dimensions.get('window');
const PHOTO_SIZE = (width - spacing.md * 4) / 3;

export const PhotosScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const { user } = useAuthContext();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPhotos(tripId);
      setPhotos(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  const handleUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
    });

    if (result.canceled || !user) return;

    setUploading(true);
    try {
      for (const asset of result.assets) {
        const fileName = asset.uri.split('/').pop() || 'photo.jpg';
        await uploadPhoto(tripId, user.id, asset.uri, fileName);
      }
      await loadPhotos();
    } catch (e) {
      Alert.alert('Fehler', 'Foto konnte nicht hochgeladen werden');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (photo: Photo) => {
    Alert.alert('Foto löschen', 'Möchtest du dieses Foto wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => {
        await deletePhoto(photo);
        setSelectedPhoto(null);
        await loadPhotos();
      }},
    ]);
  };

  return (
    <View style={styles.container}>
      <Header title="Fotos" onBack={() => navigation.goBack()} rightAction={
        <Text style={styles.count}>{photos.length}</Text>
      } />

      {photos.length === 0 ? (
        <EmptyState icon="📸" title="Keine Fotos" message="Lade Fotos hoch, um deine Reiseerinnerungen festzuhalten" actionLabel="Foto hochladen" onAction={handleUpload} />
      ) : (
        <FlatList
          data={photos}
          numColumns={3}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => setSelectedPhoto(item)} style={styles.photoWrapper}>
              <Image source={{ uri: item.url }} style={styles.photo} />
            </TouchableOpacity>
          )}
        />
      )}

      {/* Upload FAB */}
      <TouchableOpacity style={styles.fab} onPress={handleUpload} activeOpacity={0.8}>
        <LinearGradient colors={[colors.accent, colors.sky]} style={styles.fabGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={styles.fabText}>{uploading ? '...' : '📷'}</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Fullscreen Viewer */}
      <Modal visible={!!selectedPhoto} transparent animationType="fade">
        <View style={styles.viewer}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setSelectedPhoto(null)}>
            <Text style={styles.viewerCloseText}>✕</Text>
          </TouchableOpacity>
          {selectedPhoto && (
            <>
              <Image source={{ uri: selectedPhoto.url }} style={styles.viewerImage} resizeMode="contain" />
              {selectedPhoto.caption && <Text style={styles.viewerCaption}>{selectedPhoto.caption}</Text>}
              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(selectedPhoto)}>
                <Text style={styles.deleteBtnText}>Löschen</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  count: { ...typography.bodySmall, color: colors.textSecondary },
  grid: { padding: spacing.md },
  photoWrapper: { margin: spacing.xs },
  photo: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: borderRadius.sm },
  fab: { position: 'absolute', right: spacing.xl, bottom: spacing.xl, width: 56, height: 56 },
  fabGradient: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', ...shadows.lg },
  fabText: { fontSize: 24 },
  viewer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  viewerClose: { position: 'absolute', top: 60, right: 20, zIndex: 10 },
  viewerCloseText: { fontSize: 28, color: '#fff' },
  viewerImage: { width: '100%', height: '70%' },
  viewerCaption: { ...typography.body, color: '#fff', marginTop: spacing.md },
  deleteBtn: { position: 'absolute', bottom: 60, backgroundColor: colors.error, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.full },
  deleteBtnText: { color: '#fff', ...typography.button },
});
