import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image, TouchableOpacity, Modal, Animated,
  Dimensions, Alert, Platform, ActivityIndicator, TextInput, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';
import { Header, EmptyState } from '../../components/common';
import { getPhotos, uploadPhoto, deletePhoto, deletePhotos, updatePhotoCaption, parseExifDate, autoTagPhotos } from '../../api/photos';
import { getDays } from '../../api/itineraries';
import { Photo, ItineraryDay } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { useAuthContext } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { UpgradePrompt } from '../../components/common/UpgradePrompt';
import { formatDateShort, formatDateMedium } from '../../utils/dateHelpers';
import { parseISO } from 'date-fns';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { PhotosSkeleton } from '../../components/skeletons/PhotosSkeleton';

type Props = NativeStackScreenProps<RootStackParamList, 'Photos'>;

const { width } = Dimensions.get('window');
const COLUMNS = width > 600 ? 4 : 3;
const GAP = 2;
const PHOTO_SIZE = (width - GAP * (COLUMNS - 1)) / COLUMNS;

type SortOrder = 'newest' | 'oldest';

export const PhotosScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const { user } = useAuthContext();
  const { isFeatureAllowed } = useSubscription();

  if (!isFeatureAllowed('photos')) {
    return (
      <View style={styles.container}>
        <Header title="Fotos" onBack={() => navigation.navigate('TripDetail', { tripId })} />
        <UpgradePrompt
          icon="📸"
          title="Foto-Galerie"
          message="Lade Fotos hoch und teile Reiseerinnerungen mit Premium"
        />
      </View>
    );
  }

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [dayFilter, setDayFilter] = useState<string | null>(null); // null = all, day_id = filter

  // Bulk selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Viewer
  const [viewerIndex, setViewerIndex] = useState(0);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState('');
  const captionInputRef = useRef<TextInput>(null);

  // Slideshow
  const [slideshowActive, setSlideshowActive] = useState(false);
  const slideshowRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideshowProgress = useRef(new Animated.Value(0)).current;

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const [data, fetchedDays] = await Promise.all([getPhotos(tripId), getDays(tripId)]);
      setDays(fetchedDays.sort((a, b) => a.date.localeCompare(b.date)));
      setPhotos(data);
      // Auto-tag photos without day_id
      const untagged = data.filter(p => !p.day_id && p.taken_at);
      if (untagged.length > 0 && fetchedDays.length > 0) {
        const tagged = await autoTagPhotos(tripId);
        if (tagged > 0) {
          const refreshed = await getPhotos(tripId);
          setPhotos(refreshed);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  // Sort & filter by day
  const sortedPhotos = useMemo(() => {
    let filtered = photos;
    if (dayFilter) {
      filtered = photos.filter(p => p.day_id === dayFilter);
    }
    return [...filtered].sort((a, b) => {
      const dateA = a.taken_at ? parseISO(a.taken_at).getTime() : 0;
      const dateB = b.taken_at ? parseISO(b.taken_at).getTime() : 0;
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
  }, [photos, sortOrder, dayFilter]);

  const flatPhotos = sortedPhotos;

  // Day counts for filter chips
  const dayCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of photos) {
      if (p.day_id) counts.set(p.day_id, (counts.get(p.day_id) || 0) + 1);
    }
    return counts;
  }, [photos]);

  // Upload with progress + EXIF extraction
  const handleUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      exif: true,
    });

    if (result.canceled || !user) return;

    const total = result.assets.length;
    setUploading(true);
    setUploadProgress({ current: 0, total });
    try {
      for (let i = 0; i < total; i++) {
        setUploadProgress({ current: i + 1, total });
        const asset = result.assets[i];
        const fileName = asset.uri.split('/').pop() || 'photo.jpg';
        // Extract EXIF date
        const exif = (asset as any).exif;
        const exifDate = parseExifDate(
          exif?.DateTimeOriginal || exif?.DateTime || exif?.DateTimeDigitized
        );
        await uploadPhoto(tripId, user.id, asset.uri, fileName, undefined, exifDate);
      }
      await loadPhotos();
    } catch (e) {
      Alert.alert('Fehler', 'Foto konnte nicht hochgeladen werden');
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  // Single delete
  const handleDelete = (photo: Photo) => {
    Alert.alert('Foto löschen', 'Möchtest du dieses Foto wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => {
        await deletePhoto(photo);
        if (flatPhotos.length <= 1) {
          setSelectedPhoto(null);
        } else if (viewerIndex >= flatPhotos.length - 1) {
          setViewerIndex(viewerIndex - 1);
          setSelectedPhoto(flatPhotos[viewerIndex - 1]);
        }
        await loadPhotos();
      }},
    ]);
  };

  // Caption
  const startEditCaption = () => {
    setCaptionDraft(selectedPhoto?.caption || '');
    setEditingCaption(true);
    setTimeout(() => captionInputRef.current?.focus(), 100);
  };

  const saveCaption = async () => {
    if (!selectedPhoto) return;
    const newCaption = captionDraft.trim() || null;
    try {
      await updatePhotoCaption(selectedPhoto.id, newCaption);
      setPhotos(prev => prev.map(p => p.id === selectedPhoto.id ? { ...p, caption: newCaption } : p));
      setSelectedPhoto(prev => prev ? { ...prev, caption: newCaption } : null);
    } catch (e) {
      Alert.alert('Fehler', 'Beschreibung konnte nicht gespeichert werden');
    }
    setEditingCaption(false);
  };

  // Select
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const selectAll = () => setSelectedIds(new Set(photos.map(p => p.id)));

  // Bulk delete
  const handleBulkDelete = () => {
    const count = selectedIds.size;
    if (count === 0) return;
    Alert.alert(
      `${count} Foto${count > 1 ? 's' : ''} löschen`,
      `Möchtest du ${count} Foto${count > 1 ? 's' : ''} unwiderruflich löschen?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Löschen', style: 'destructive', onPress: async () => {
          setBulkProcessing(true);
          try {
            await deletePhotos(photos.filter(p => selectedIds.has(p.id)));
            exitSelectMode();
            await loadPhotos();
          } catch (e) {
            Alert.alert('Fehler', 'Einige Fotos konnten nicht gelöscht werden');
          } finally {
            setBulkProcessing(false);
          }
        }},
      ]
    );
  };

  // Export / Share — uses Web Share API or native share sheet
  const handleExport = async (photoUrls: string[]) => {
    if (photoUrls.length === 0) return;

    if (Platform.OS === 'web') {
      try {
        // Try Web Share API (works on mobile browsers)
        if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
          const files: File[] = [];
          for (const url of photoUrls) {
            const response = await fetch(url);
            const blob = await response.blob();
            const fileName = url.split('/').pop() || 'photo.jpg';
            files.push(new File([blob], fileName, { type: 'image/jpeg' }));
          }
          const shareData = { files };
          if (navigator.canShare(shareData)) {
            await navigator.share(shareData);
            return;
          }
        }
        // Fallback: download via blob
        for (const url of photoUrls) {
          const response = await fetch(url);
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = url.split('/').pop() || 'photo.jpg';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        }
      } catch (e) {
        Alert.alert('Fehler', 'Fotos konnten nicht geteilt werden');
      }
      return;
    }

    // Native: open share sheet
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Nicht verfügbar', 'Teilen ist auf diesem Gerät nicht verfügbar');
        return;
      }
      for (const url of photoUrls) {
        await Sharing.shareAsync(url, { mimeType: 'image/jpeg', dialogTitle: 'Foto speichern oder teilen' });
      }
    } catch (e) {
      Alert.alert('Fehler', 'Fotos konnten nicht geteilt werden');
    }
  };

  const handleBulkExport = async () => {
    if (selectedIds.size === 0) return;
    setBulkProcessing(true);
    try {
      const urls = photos.filter(p => selectedIds.has(p.id)).map(p => p.url);
      await handleExport(urls);
      exitSelectMode();
    } catch (e) {
      Alert.alert('Fehler', 'Export fehlgeschlagen');
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleSingleExport = (photo: Photo) => handleExport([photo.url]);

  // Viewer navigation
  const openViewer = (photo: Photo) => {
    const idx = flatPhotos.findIndex(p => p.id === photo.id);
    setViewerIndex(idx >= 0 ? idx : 0);
    setSelectedPhoto(photo);
    setEditingCaption(false);
  };

  const viewerGo = (dir: -1 | 1) => {
    stopSlideshow();
    const i = viewerIndex + dir;
    if (i >= 0 && i < flatPhotos.length) {
      setViewerIndex(i);
      setSelectedPhoto(flatPhotos[i]);
      setEditingCaption(false);
    }
  };

  // Slideshow
  const startSlideshow = () => {
    setSlideshowActive(true);
  };

  const stopSlideshow = () => {
    setSlideshowActive(false);
    if (slideshowRef.current) { clearInterval(slideshowRef.current); slideshowRef.current = null; }
  };

  const SLIDESHOW_INTERVAL = 4000;

  const advanceSlideshow = useCallback(() => {
    // Fade out
    Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
      setViewerIndex(prev => {
        const next = prev + 1 >= flatPhotos.length ? 0 : prev + 1;
        setSelectedPhoto(flatPhotos[next]);
        return next;
      });
      // Fade in
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    });
  }, [fadeAnim, flatPhotos]);

  useEffect(() => {
    if (slideshowActive && selectedPhoto) {
      // Animate progress bar
      slideshowProgress.setValue(0);
      Animated.timing(slideshowProgress, {
        toValue: 1, duration: SLIDESHOW_INTERVAL, useNativeDriver: false,
      }).start();
      slideshowRef.current = setInterval(() => {
        advanceSlideshow();
        // Reset progress bar
        slideshowProgress.setValue(0);
        Animated.timing(slideshowProgress, {
          toValue: 1, duration: SLIDESHOW_INTERVAL, useNativeDriver: false,
        }).start();
      }, SLIDESHOW_INTERVAL);
    } else {
      if (slideshowRef.current) { clearInterval(slideshowRef.current); slideshowRef.current = null; }
      fadeAnim.setValue(1);
      slideshowProgress.setValue(0);
    }
    return () => { if (slideshowRef.current) clearInterval(slideshowRef.current); };
  }, [slideshowActive]);

  // Stats
  const photoStats = useMemo(() => {
    const dates = new Set(photos.map(p => p.taken_at?.slice(0, 10)).filter(Boolean));
    return { count: photos.length, days: dates.size };
  }, [photos]);

  const handlePhotoPress = (photo: Photo) => {
    if (selectMode) toggleSelect(photo.id);
    else openViewer(photo);
  };

  const handlePhotoLongPress = (photo: Photo) => {
    if (!selectMode) {
      setSelectMode(true);
      setSelectedIds(new Set([photo.id]));
    }
  };

  const getDayLabel = (dayId: string | null): string | null => {
    if (!dayId) return null;
    const idx = days.findIndex(d => d.id === dayId);
    return idx >= 0 ? `Tag ${idx + 1}` : null;
  };

  const renderItem = ({ item }: { item: Photo }) => {
    const isSelected = selectedIds.has(item.id);
    const dayLabel = getDayLabel(item.day_id);
    return (
      <TouchableOpacity
        onPress={() => handlePhotoPress(item)}
        onLongPress={() => handlePhotoLongPress(item)}
        delayLongPress={400}
        activeOpacity={0.85}
        style={styles.photoCell}
      >
        <Image source={{ uri: item.url }} style={styles.photo} />
        {!selectMode && (
          <View style={styles.photoOverlays}>
            {dayLabel && (
              <View style={styles.dayBadge}>
                <Text style={styles.dayBadgeText}>{dayLabel}</Text>
              </View>
            )}
            {item.taken_at && (
              <View style={styles.dateOverlay}>
                <Text style={styles.dateOverlayText}>{formatDateShort(item.taken_at)}</Text>
              </View>
            )}
          </View>
        )}
        {selectMode && (
          <View style={[styles.selectOverlay, isSelected && styles.selectOverlayActive]}>
            <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
              {isSelected && <Text style={styles.checkmark}>✓</Text>}
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      {selectMode ? (
        <Header
          title={`${selectedIds.size} ausgewählt`}
          onBack={exitSelectMode}
          rightAction={
            <TouchableOpacity onPress={selectAll}>
              <Text style={styles.selectAllText}>Alle</Text>
            </TouchableOpacity>
          }
        />
      ) : (
        <Header
          title="Fotos"
          onBack={() => navigation.navigate('TripDetail', { tripId })}
          rightAction={photos.length > 0 ? <Text style={styles.count}>{photos.length}</Text> : undefined}
        />
      )}

      {/* Toolbar */}
      {!loading && photos.length > 0 && (
        <View style={styles.toolbar}>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
            activeOpacity={0.7}
          >
            <Text style={styles.sortIcon}>{sortOrder === 'newest' ? '↓' : '↑'}</Text>
            <Text style={styles.sortText}>{sortOrder === 'newest' ? 'Neueste' : 'Älteste'}</Text>
          </TouchableOpacity>
          {selectMode ? (
            <>
              {selectedIds.size > 0 && (
                <>
                  <TouchableOpacity style={styles.bulkAction} onPress={handleBulkExport} disabled={bulkProcessing}>
                    <Text style={styles.bulkIcon}>↗</Text>
                    <Text style={styles.bulkText}>Teilen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.bulkAction, styles.bulkDelete]} onPress={handleBulkDelete} disabled={bulkProcessing}>
                    <Text style={[styles.bulkIcon, { color: colors.error }]}>✕</Text>
                    <Text style={[styles.bulkText, { color: colors.error }]}>Löschen</Text>
                  </TouchableOpacity>
                  {bulkProcessing && <ActivityIndicator size="small" color={colors.accent} />}
                </>
              )}
              <TouchableOpacity style={styles.bulkCancel} onPress={exitSelectMode}>
                <Text style={styles.bulkCancelText}>Abbrechen</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {photoStats.days > 1 && (
                <Text style={styles.statsText}>{photoStats.count} Fotos · {photoStats.days} Tage</Text>
              )}
              {flatPhotos.length >= 3 && (
                <TouchableOpacity
                  style={styles.slideshowButton}
                  onPress={() => { openViewer(flatPhotos[0]); startSlideshow(); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.slideshowButtonText}>▶ Diashow</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.selectButton} onPress={() => setSelectMode(true)} activeOpacity={0.7}>
                <Text style={styles.selectButtonText}>Auswählen</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Day filter chips */}
      {!loading && days.length > 0 && dayCounts.size > 0 && !selectMode && (
        <View style={styles.dayFilterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayFilterContent}>
            <TouchableOpacity
              style={[styles.dayChip, !dayFilter && styles.dayChipActive]}
              onPress={() => setDayFilter(null)}
            >
              <Text style={[styles.dayChipText, !dayFilter && styles.dayChipTextActive]}>Alle</Text>
            </TouchableOpacity>
            {days.map((day, i) => {
              const count = dayCounts.get(day.id) || 0;
              if (count === 0) return null;
              return (
                <TouchableOpacity
                  key={day.id}
                  style={[styles.dayChip, dayFilter === day.id && styles.dayChipActive]}
                  onPress={() => setDayFilter(dayFilter === day.id ? null : day.id)}
                >
                  <Text style={[styles.dayChipText, dayFilter === day.id && styles.dayChipTextActive]}>
                    Tag {i + 1} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Upload progress */}
      {uploading && uploadProgress.total > 1 && (
        <View style={styles.uploadBanner}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.uploadBannerText}>
            Lade hoch {uploadProgress.current}/{uploadProgress.total}...
          </Text>
          <View style={styles.uploadProgressBar}>
            <View style={[styles.uploadProgressFill, { width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }]} />
          </View>
        </View>
      )}

      {/* Content */}
      {loading ? (
        <PhotosSkeleton />
      ) : photos.length === 0 ? (
        <EmptyState
          icon="📸"
          title="Keine Fotos"
          message="Lade Fotos hoch, um deine Reiseerinnerungen festzuhalten"
          actionLabel="Foto hochladen"
          onAction={handleUpload}
        />
      ) : (
        <FlatList
          data={sortedPhotos}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          numColumns={COLUMNS}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.columnWrapper}
        />
      )}

      {/* Upload FAB */}
      {!selectMode && (
        <TouchableOpacity style={styles.fab} onPress={handleUpload} activeOpacity={0.8} disabled={uploading}>
          <LinearGradient colors={[colors.accent, colors.sky]} style={styles.fabGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.fabText}>+</Text>}
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Fullscreen Viewer */}
      <Modal visible={!!selectedPhoto} transparent animationType="fade">
        <KeyboardAvoidingView style={styles.viewer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Top bar */}
          <View style={styles.viewerTopBar}>
            <TouchableOpacity style={styles.viewerBtn} onPress={() => { setSelectedPhoto(null); setEditingCaption(false); stopSlideshow(); }}>
              <Text style={styles.viewerBtnText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.viewerCounter}>
              {slideshowActive ? 'Diashow' : flatPhotos.length > 0 ? `${viewerIndex + 1} / ${flatPhotos.length}` : ''}
            </Text>
            <View style={styles.viewerTopActions}>
              {flatPhotos.length >= 3 && (
                <TouchableOpacity style={styles.viewerBtn} onPress={slideshowActive ? stopSlideshow : startSlideshow}>
                  <Text style={styles.viewerBtnText}>{slideshowActive ? '⏸' : '▶'}</Text>
                </TouchableOpacity>
              )}
              {selectedPhoto && (
                <TouchableOpacity style={styles.viewerBtn} onPress={() => handleSingleExport(selectedPhoto)}>
                  <Text style={styles.viewerBtnText}>↗</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Slideshow progress bar */}
          {slideshowActive && (
            <View style={styles.slideshowProgressTrack}>
              <Animated.View style={[styles.slideshowProgressFill, {
                width: slideshowProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              }]} />
            </View>
          )}

          {/* Image + navigation */}
          {selectedPhoto && (
            <Animated.View style={[styles.viewerContent, { opacity: fadeAnim }]}>
              {viewerIndex > 0 && !slideshowActive && (
                <TouchableOpacity style={[styles.viewerNav, styles.viewerNavLeft]} onPress={() => viewerGo(-1)}>
                  <Text style={styles.viewerNavText}>‹</Text>
                </TouchableOpacity>
              )}
              <Image source={{ uri: selectedPhoto.url }} style={styles.viewerImage} resizeMode="contain" />
              {viewerIndex < flatPhotos.length - 1 && !slideshowActive && (
                <TouchableOpacity style={[styles.viewerNav, styles.viewerNavRight]} onPress={() => viewerGo(1)}>
                  <Text style={styles.viewerNavText}>›</Text>
                </TouchableOpacity>
              )}
            </Animated.View>
          )}

          {/* Bottom bar */}
          {selectedPhoto && (
            <View style={styles.viewerBottomBar}>
              <View style={styles.viewerInfo}>
                {selectedPhoto.taken_at && (
                  <Text style={styles.viewerDate}>{formatDateMedium(selectedPhoto.taken_at)}</Text>
                )}
                {editingCaption ? (
                  <View style={styles.captionEditRow}>
                    <TextInput
                      ref={captionInputRef}
                      style={styles.captionInput}
                      value={captionDraft}
                      onChangeText={setCaptionDraft}
                      placeholder="Beschreibung hinzufügen..."
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      returnKeyType="done"
                      onSubmitEditing={saveCaption}
                      maxLength={200}
                    />
                    <TouchableOpacity onPress={saveCaption} style={styles.captionSaveBtn}>
                      <Text style={styles.captionSaveText}>OK</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={startEditCaption} activeOpacity={0.7}>
                    <Text style={[styles.viewerCaption, selectedPhoto.caption && styles.viewerCaptionFilled]}>
                      {selectedPhoto.caption || 'Beschreibung hinzufügen...'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity style={styles.viewerDeleteBtn} onPress={() => handleDelete(selectedPhoto)}>
                <Text style={styles.viewerDeleteText}>Löschen</Text>
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Header
  count: { ...typography.bodySmall, color: colors.textSecondary },

  // Toolbar
  toolbar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border,
    flexWrap: 'wrap' as const,
  },
  sortButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
  },
  sortIcon: { fontSize: 14, color: colors.accent, fontWeight: '600' },
  sortText: { ...typography.caption, color: colors.text, fontWeight: '500' },
  statsText: { ...typography.caption, color: colors.textLight, flex: 1 },
  slideshowButton: {
    paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full, backgroundColor: colors.accent + '15',
  },
  slideshowButtonText: { ...typography.caption, color: colors.accent, fontWeight: '500' },
  selectButton: {
    paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full, backgroundColor: colors.background,
  },
  selectButtonText: { ...typography.caption, color: colors.accent, fontWeight: '500' },
  selectAllText: { ...typography.bodySmall, color: colors.accent, fontWeight: '600' },

  // Bulk actions
  bulkAction: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full, backgroundColor: colors.background,
  },
  bulkDelete: { backgroundColor: '#FFF0ED' },
  bulkIcon: { fontSize: 16, color: colors.accent, fontWeight: '700' },
  bulkText: { ...typography.bodySmall, fontWeight: '500' },
  bulkCancel: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1.5, borderColor: colors.textSecondary,
  },
  bulkCancelText: { ...typography.bodySmall, color: colors.text, fontWeight: '600' },

  // Upload banner
  uploadBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  uploadBannerText: { ...typography.caption, color: colors.text, fontWeight: '500' },
  uploadProgressBar: { flex: 1, height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
  uploadProgressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 2 },

  // Day filter
  dayFilterRow: {
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  dayFilterContent: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, gap: spacing.xs,
  },
  dayChip: {
    paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs,
    borderRadius: borderRadius.full, backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border,
  },
  dayChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  dayChipText: { ...typography.caption, fontWeight: '500' as const, color: colors.text },
  dayChipTextActive: { color: '#fff' },

  // Grid
  grid: { paddingBottom: 100 },
  columnWrapper: { gap: GAP, marginBottom: GAP },

  // Photo cell
  photoCell: { width: PHOTO_SIZE, height: PHOTO_SIZE, overflow: 'hidden', position: 'relative' },
  photo: { width: '100%', height: '100%' },
  photoOverlays: {
    position: 'absolute' as const, bottom: 0, left: 0, right: 0,
    flexDirection: 'row' as const, justifyContent: 'space-between' as const,
    padding: 4,
  },
  dayBadge: {
    backgroundColor: 'rgba(108,92,231,0.85)', paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 6,
  },
  dayBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' as const },
  dateOverlay: {
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 6,
  },
  dateOverlayText: { color: '#fff', fontSize: 9, fontWeight: '600', letterSpacing: 0.2 },

  // Selection overlay
  selectOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent',
    justifyContent: 'flex-start', alignItems: 'flex-end', padding: 6,
  },
  selectOverlayActive: { backgroundColor: 'rgba(108, 92, 231, 0.2)' },
  checkbox: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: '#fff', backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700', marginTop: -1 },

  // FAB
  fab: { position: 'absolute', right: spacing.xl, bottom: spacing.xl, width: 56, height: 56 },
  fabGradient: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', ...shadows.lg,
  },
  fabText: { fontSize: 28, color: '#fff', fontWeight: '300', marginTop: -2 },

  // Viewer
  viewer: { flex: 1, backgroundColor: '#000' },
  viewerTopBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'web' ? spacing.lg : 56,
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
  },
  viewerTopActions: { flexDirection: 'row', gap: spacing.sm },
  viewerBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  viewerBtnText: { fontSize: 20, color: '#fff', fontWeight: '500' },
  viewerCounter: { ...typography.bodySmall, color: 'rgba(255,255,255,0.6)' },

  slideshowProgressTrack: {
    height: 3, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: spacing.md,
  },
  slideshowProgressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 2 },

  viewerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerNav: {
    position: 'absolute', top: 0, bottom: 0, width: 60,
    justifyContent: 'center', alignItems: 'center', zIndex: 10,
  },
  viewerNavLeft: { left: 0 },
  viewerNavRight: { right: 0 },
  viewerNavText: { fontSize: 44, color: 'rgba(255,255,255,0.6)', fontWeight: '300' },

  viewerBottomBar: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    paddingBottom: Platform.OS === 'web' ? spacing.lg : 40,
  },
  viewerInfo: { flex: 1 },
  viewerDate: { ...typography.bodySmall, color: 'rgba(255,255,255,0.7)' },
  viewerCaption: { ...typography.body, color: 'rgba(255,255,255,0.4)', marginTop: 2, fontStyle: 'italic' },
  viewerCaptionFilled: { color: '#fff', fontStyle: 'normal' },

  captionEditRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs, gap: spacing.xs },
  captionInput: {
    flex: 1, ...typography.body, color: '#fff',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.3)',
    paddingVertical: spacing.xs,
  },
  captionSaveBtn: {
    paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs,
    borderRadius: borderRadius.full, backgroundColor: colors.accent,
  },
  captionSaveText: { ...typography.bodySmall, color: '#fff', fontWeight: '600' },

  viewerDeleteBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full, backgroundColor: 'rgba(225,112,85,0.2)',
    marginLeft: spacing.md,
  },
  viewerDeleteText: { ...typography.bodySmall, color: colors.error, fontWeight: '600' },
});
