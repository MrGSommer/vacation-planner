import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, Animated,
  Dimensions, Platform, ActivityIndicator, TextInput, KeyboardAvoidingView, ScrollView,
  PanResponder, RefreshControl, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import { unlockWebAudio, lockWebAudio, createWebAudioPlayer } from '../../utils/webAudioUnlock';
import { PhotoMapView } from '../../components/common/PhotoMapView';
import { Header, EmptyState } from '../../components/common';
import { getPhotos, uploadPhoto, deletePhoto, deletePhotos, updatePhotoCaption, parseExifDate, autoTagPhotos, insertInspirationPhotos, removeInspirationPhotos, InspirationLocation } from '../../api/photos';
import { requireOnline } from '../../utils/offlineGate';
import { extractExifDateFromUri, extractExifDateFromBuffer, extractExifDataFromBuffer } from '../../utils/exifReader';
import { getDays, getActivitiesForTrip } from '../../api/itineraries';
import { getTrip } from '../../api/trips';
import { Photo, ItineraryDay, Trip, Activity } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { useAuthContext } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useToast } from '../../contexts/ToastContext';
import { getDisplayName } from '../../utils/profileHelpers';
import { UpgradePrompt } from '../../components/common/UpgradePrompt';
import { SneakPeekOverlay } from '../../components/common/SneakPeekOverlay';
import { formatDateShort, formatDateMedium, formatDateRange } from '../../utils/dateHelpers';
import { parseISO } from 'date-fns';
import { Icon } from '../../utils/icons';
import { colors, spacing, borderRadius, typography, shadows, gradients } from '../../utils/theme';
import { PhotosSkeleton } from '../../components/skeletons/PhotosSkeleton';
import { usePresence } from '../../hooks/usePresence';
import { MUSIC_TRACKS, MusicTrack, getMusicUrl } from '../../config/music';
import { SlideshowShareModal } from '../../components/photos/SlideshowShareModal';
import { trackEvent } from '../../api/analytics';

type Props = NativeStackScreenProps<RootStackParamList, 'Photos'>;

const { width } = Dimensions.get('window');
const COLUMNS = width > 600 ? 4 : 3;
const GAP = 2;
const PHOTO_SIZE = (width - GAP * (COLUMNS - 1)) / COLUMNS;

type SortOrder = 'newest' | 'oldest';

export const PhotosScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const { user, profile } = useAuthContext();
  const { isFeatureAllowed, isSneakPeek, isPremium, canAddPhoto, maxPhotosPerTrip } = useSubscription();
  const { showToast } = useToast();
  usePresence(tripId, 'Fotos');
  const creatorName = profile ? getDisplayName(profile) : undefined;

  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    if (Platform.OS === 'web') {
      try { return (localStorage.getItem('photos_sort_order') as SortOrder) || 'newest'; } catch { return 'newest'; }
    }
    return 'newest';
  });
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [dayFilter, setDayFilter] = useState<string | null>(null); // null = all, day_id = filter
  const [trip, setTrip] = useState<Trip | null>(null);
  const [tripName, setTripName] = useState<string>('');
  const [inspirationLocations, setInspirationLocations] = useState<InspirationLocation[]>([]);
  const [inspirationLoading, setInspirationLoading] = useState(false);
  const [showInspirationModal, setShowInspirationModal] = useState(false);

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
  const introFadeAnim = useRef(new Animated.Value(1)).current;
  const slideshowProgress = useRef(new Animated.Value(0)).current;
  const slideshowIndexRef = useRef(0);

  // Slideshow music
  const slideshowSoundRef = useRef<AudioPlayer | null>(null);
  const slideshowWebAudioRef = useRef<HTMLAudioElement | null>(null);

  // Slideshow intro + settings
  const [showIntro, setShowIntro] = useState(true);
  const [selectedTrack, setSelectedTrack] = useState<MusicTrack>('relaxed');
  const [slideshowIntervalMs, setSlideshowIntervalMs] = useState(4000);
  const [showSlideshowSettings, setShowSlideshowSettings] = useState(false);

  // Share modal
  const [showSlideshowShare, setShowSlideshowShare] = useState(false);

  // Swipe gesture for viewer
  const viewerGoRef = useRef<(dir: -1 | 1) => void>(() => {});
  const slideshowActiveRef = useRef(false);
  slideshowActiveRef.current = slideshowActive;

  const SWIPE_THRESHOLD = 30;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        if (slideshowActiveRef.current) return false;
        return Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.2;
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > SWIPE_THRESHOLD) viewerGoRef.current(-1);
        else if (gs.dx < -SWIPE_THRESHOLD) viewerGoRef.current(1);
      },
    })
  ).current;

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const [data, fetchedDays, trip, activities] = await Promise.all([getPhotos(tripId), getDays(tripId), getTrip(tripId), getActivitiesForTrip(tripId)]);
      setDays(fetchedDays.sort((a, b) => a.date.localeCompare(b.date)));
      setPhotos(data);
      // Build inspiration locations from hotel activities (with check-in dates)
      const hotelLocs: InspirationLocation[] = activities
        .filter(a => a.category === 'hotel' && a.title && a.check_in_date)
        .map(a => ({ name: a.title, date: a.check_in_date! }));
      setInspirationLocations(hotelLocs);
      if (trip) { setTrip(trip); setTripName(trip.name); }
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

  // Photos with GPS coordinates
  const geoPhotos = useMemo(() => photos.filter(p => p.lat != null && p.lng != null), [photos]);

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
    if (!requireOnline('Foto-Upload')) return;
    // Gate: free tier photo limit (counts uploads + inspiration images)
    if (!canAddPhoto(photos.length)) {
      trackEvent('paywall_shown', { trigger: 'photo_limit_reached' });
      showToast(
        maxPhotosPerTrip != null
          ? `Foto-Limit erreicht (${photos.length}/${maxPhotosPerTrip}) — Premium für unbegrenzte Fotos`
          : 'Foto-Limit erreicht',
        'error',
      );
      navigation.navigate('Subscription');
      return;
    }
    if (Platform.OS === 'web') {
      // Web: use native file input to access ORIGINAL files with EXIF intact
      // (expo-image-picker recompresses via Canvas, stripping EXIF)
      // Input MUST be in the DOM for onchange to fire reliably across browsers
      const prev = document.getElementById('wayfable-photo-input');
      if (prev) prev.remove();
      const input = document.createElement('input');
      input.id = 'wayfable-photo-input';
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = async () => {
        let files = Array.from(input.files || []);
        input.remove();
        if (files.length === 0 || !user) return;
        if (maxPhotosPerTrip != null) {
          const remaining = Math.max(0, maxPhotosPerTrip - photos.length);
          if (files.length > remaining) {
            files = files.slice(0, remaining);
            showToast(
              `Nur ${remaining} von ${input.files?.length || 0} Fotos — Free-Limit ${maxPhotosPerTrip}`,
              'error',
            );
            if (remaining === 0) return;
          }
        }
        setUploading(true);
        setUploadProgress({ current: 0, total: files.length });
        try {
          for (let i = 0; i < files.length; i++) {
            setUploadProgress({ current: i + 1, total: files.length });
            const file = files[i];
            // Read EXIF from ORIGINAL file bytes (before any compression)
            const buffer = await file.arrayBuffer();
            const exifData = extractExifDataFromBuffer(buffer);
            // Create blob URL for Canvas compression
            const blobUrl = URL.createObjectURL(file);
            try {
              const newPhoto = await uploadPhoto(tripId, user.id, blobUrl, file.name, undefined, exifData.date, tripName, creatorName, exifData.lat, exifData.lng);
              setPhotos(prev => [newPhoto, ...prev]);
            } finally {
              URL.revokeObjectURL(blobUrl);
            }
          }
          await loadPhotos();
        } catch (e: any) {
          if (e?.code === 'photo_limit_reached' || e?.message === 'photo_limit_reached') {
            trackEvent('paywall_shown', { trigger: 'photo_limit_reached' });
            showToast(
              `Foto-Limit erreicht — Premium für unbegrenzte Fotos`,
              'error',
            );
            navigation.navigate('Subscription');
          } else {
            showToast('Foto konnte nicht hochgeladen werden', 'error');
          }
        } finally {
          setUploading(false);
          setUploadProgress({ current: 0, total: 0 });
        }
      };
      input.click();
      return;
    }

    // Native: use expo-image-picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      exif: true,
    });

    if (result.canceled || !user) return;

    let assets = result.assets;
    if (maxPhotosPerTrip != null) {
      const remaining = Math.max(0, maxPhotosPerTrip - photos.length);
      if (assets.length > remaining) {
        assets = assets.slice(0, remaining);
        showToast(
          `Nur ${remaining} von ${result.assets.length} Fotos — Free-Limit ${maxPhotosPerTrip}`,
          'error',
        );
        if (remaining === 0) return;
      }
    }
    const total = assets.length;
    setUploading(true);
    setUploadProgress({ current: 0, total });
    try {
      for (let i = 0; i < total; i++) {
        setUploadProgress({ current: i + 1, total });
        const asset = assets[i];
        const fileName = asset.uri.split('/').pop() || 'photo.jpg';
        // Extract EXIF date — try picker metadata first, then binary EXIF reader
        const exif = (asset as any).exif;
        let exifDate = parseExifDate(
          exif?.DateTimeOriginal || exif?.DateTime || exif?.DateTimeDigitized
        );
        if (!exifDate) {
          exifDate = await extractExifDateFromUri(asset.uri);
        }
        const newPhoto = await uploadPhoto(tripId, user.id, asset.uri, fileName, undefined, exifDate, tripName, creatorName);
        setPhotos(prev => [newPhoto, ...prev]);
      }
      await loadPhotos();
    } catch (e: any) {
      if (e?.code === 'photo_limit_reached' || e?.message === 'photo_limit_reached') {
        trackEvent('paywall_shown', { trigger: 'photo_limit_reached' });
        showToast('Foto-Limit erreicht — Premium für unbegrenzte Fotos', 'error');
        navigation.navigate('Subscription');
      } else {
        showToast('Foto konnte nicht hochgeladen werden', 'error');
      }
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  // Single delete
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (photo: Photo) => {
    if (readonlyMode) { showToast('Upgrade auf Premium um löschen zu können', 'info'); return; }
    if (!window.confirm('Möchtest du dieses Foto wirklich löschen?')) return;
    setDeleting(true);
    try {
      await deletePhoto(photo);
      if (flatPhotos.length <= 1) {
        setSelectedPhoto(null);
      } else if (viewerIndex >= flatPhotos.length - 1) {
        setViewerIndex(viewerIndex - 1);
        setSelectedPhoto(flatPhotos[viewerIndex - 1]);
      } else {
        setSelectedPhoto(flatPhotos[viewerIndex + 1]);
      }
      await loadPhotos();
    } catch (e) {
      showToast('Foto konnte nicht gelöscht werden', 'error');
    } finally {
      setDeleting(false);
    }
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
      showToast('Beschreibung konnte nicht gespeichert werden', 'error');
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
  const handleBulkDelete = async () => {
    if (readonlyMode) { showToast('Upgrade auf Premium um löschen zu können', 'info'); return; }
    const count = selectedIds.size;
    if (count === 0) return;
    if (!window.confirm(`${count} Foto${count > 1 ? 's' : ''} unwiderruflich löschen?`)) return;
    setBulkProcessing(true);
    try {
      await deletePhotos(photos.filter(p => selectedIds.has(p.id)));
      exitSelectMode();
      await loadPhotos();
    } catch (e) {
      showToast('Einige Fotos konnten nicht gelöscht werden', 'error');
    } finally {
      setBulkProcessing(false);
    }
  };

  // Build share filename: wayfable_{trip}_{datum}.jpg
  const buildShareName = (photo: Photo, index: number): string => {
    const trip = tripName
      ? tripName.replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue')
          .replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase()
      : 'trip';
    const dateStr = photo.taken_at
      ? photo.taken_at.slice(0, 10).replace(/-/g, '')
      : new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `wayfable_${trip}_${dateStr}_${index + 1}.jpg`;
  };

  // Export / Share — uses Web Share API or native share sheet
  const handleExport = async (photoUrls: string[], exportPhotos?: Photo[]) => {
    if (photoUrls.length === 0) return;

    if (Platform.OS === 'web') {
      try {
        // Try Web Share API (works on mobile browsers)
        if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
          const files: File[] = [];
          for (let i = 0; i < photoUrls.length; i++) {
            const response = await fetch(photoUrls[i]);
            const blob = await response.blob();
            const cleanName = exportPhotos?.[i]
              ? buildShareName(exportPhotos[i], i)
              : `wayfable_foto_${i + 1}.jpg`;
            // Ensure blob is typed as image/jpeg for proper OS recognition
            const imageBlob = blob.type.startsWith('image/')
              ? blob
              : new Blob([blob], { type: 'image/jpeg' });
            files.push(new File([imageBlob], cleanName, { type: 'image/jpeg' }));
          }
          const shareData: ShareData = { files };
          if (navigator.canShare(shareData)) {
            await navigator.share(shareData);
            return;
          }
        }
        // Fallback: download via blob
        for (let i = 0; i < photoUrls.length; i++) {
          const response = await fetch(photoUrls[i]);
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = exportPhotos?.[i]
            ? buildShareName(exportPhotos[i], i)
            : `wayfable_foto_${i + 1}.jpg`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        }
      } catch (e) {
        showToast('Fotos konnten nicht geteilt werden', 'error');
      }
      return;
    }

    // Native: open share sheet
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        showToast('Teilen ist auf diesem Gerät nicht verfügbar', 'error');
        return;
      }
      for (const url of photoUrls) {
        await Sharing.shareAsync(url, { mimeType: 'image/jpeg', dialogTitle: 'Foto speichern oder teilen' });
      }
    } catch (e) {
      showToast('Fotos konnten nicht geteilt werden', 'error');
    }
  };

  const handleBulkExport = async () => {
    if (selectedIds.size === 0) return;
    setBulkProcessing(true);
    try {
      const selected = photos.filter(p => selectedIds.has(p.id));
      await handleExport(selected.map(p => p.url), selected);
      exitSelectMode();
    } catch (e) {
      showToast('Export fehlgeschlagen', 'error');
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleSingleExport = (photo: Photo) => handleExport([photo.url], [photo]);

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
  viewerGoRef.current = viewerGo;

  // Slideshow — audio MUST start inside gesture handler for PWA compatibility
  const startSlideshow = () => {
    if (Platform.OS === 'web') {
      unlockWebAudio();
      const audio = createWebAudioPlayer(getMusicUrl(selectedTrack), { loop: true, volume: 0.5 });
      audio.play().catch((e) => console.warn('Audio play failed:', e));
      slideshowWebAudioRef.current = audio;
    } else {
      try {
        const player = createAudioPlayer(getMusicUrl(selectedTrack));
        player.loop = true;
        player.volume = 0.5;
        player.play();
        slideshowSoundRef.current = player;
      } catch (e) {
        console.warn('Audio play failed:', e);
      }
    }
    setShowIntro(true);
    setSlideshowActive(true);
  };

  const stopSlideshow = () => {
    setSlideshowActive(false);
    if (slideshowRef.current) { clearInterval(slideshowRef.current); slideshowRef.current = null; }
    if (slideshowSoundRef.current) {
      slideshowSoundRef.current.remove();
      slideshowSoundRef.current = null;
    }
    if (slideshowWebAudioRef.current) {
      slideshowWebAudioRef.current.pause();
      slideshowWebAudioRef.current.src = '';
      slideshowWebAudioRef.current = null;
    }
    lockWebAudio();
  };

  const slideshowInterval = slideshowIntervalMs;

  // Preload next slideshow image to avoid loading flash
  useEffect(() => {
    if (!slideshowActive || flatPhotos.length === 0) return;
    if (Platform.OS !== 'web') return;
    if (showIntro) {
      // During intro, preload the current (first) photo
      const url = flatPhotos[viewerIndex]?.url;
      if (url) { const img = new window.Image(); img.src = url; }
      return;
    }
    const nextIdx = viewerIndex + 1 >= flatPhotos.length ? 0 : viewerIndex + 1;
    const nextUrl = flatPhotos[nextIdx]?.url;
    if (nextUrl) { const img = new window.Image(); img.src = nextUrl; }
  }, [slideshowActive, viewerIndex, flatPhotos, showIntro]);

  // Crossfade: next image fades in over current
  const [crossfadeUrl, setCrossfadeUrl] = useState<string | null>(null);

  // Keep ref in sync
  useEffect(() => { slideshowIndexRef.current = viewerIndex; }, [viewerIndex]);

  const advanceSlideshow = useCallback(() => {
    const currentIdx = slideshowIndexRef.current;
    const nextIdx = (currentIdx + 1) % flatPhotos.length;
    const nextPhoto = flatPhotos[nextIdx];
    if (!nextPhoto) return;

    // Set next image on top layer, start transparent
    setCrossfadeUrl(nextPhoto.url);
    fadeAnim.setValue(0);

    // Fade in the next image over the current
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: false }).start(() => {
      // Swap base image first (overlay still covers it)
      slideshowIndexRef.current = nextIdx;
      setViewerIndex(nextIdx);
      setSelectedPhoto(nextPhoto);
      // Clear overlay on next frame so base has rendered the new image
      requestAnimationFrame(() => {
        setCrossfadeUrl(null);
        fadeAnim.setValue(1);
      });
    });
  }, [fadeAnim, flatPhotos]);

  useEffect(() => {
    if (slideshowActive && selectedPhoto) {
      if (showIntro) {
        // Intro slide: wait slideshowInterval, then fade out intro
        introFadeAnim.setValue(1);
        slideshowProgress.setValue(0);
        Animated.timing(slideshowProgress, {
          toValue: 1, duration: slideshowInterval, useNativeDriver: false,
        }).start();
        const introTimer = setTimeout(() => {
          Animated.timing(introFadeAnim, {
            toValue: 0, duration: 800, useNativeDriver: false,
          }).start(() => {
            setShowIntro(false);
            introFadeAnim.setValue(1);
          });
        }, slideshowInterval);
        return () => clearTimeout(introTimer);
      }

      // Normal slideshow: animate progress bar + advance photos
      slideshowProgress.setValue(0);
      Animated.timing(slideshowProgress, {
        toValue: 1, duration: slideshowInterval, useNativeDriver: false,
      }).start();
      slideshowRef.current = setInterval(() => {
        advanceSlideshow();
        slideshowProgress.setValue(0);
        Animated.timing(slideshowProgress, {
          toValue: 1, duration: slideshowInterval, useNativeDriver: false,
        }).start();
      }, slideshowInterval);
    } else {
      if (slideshowRef.current) { clearInterval(slideshowRef.current); slideshowRef.current = null; }
      fadeAnim.setValue(1);
      slideshowProgress.setValue(0);
    }
    return () => { if (slideshowRef.current) clearInterval(slideshowRef.current); };
  }, [slideshowActive, showIntro, slideshowInterval]);

  // Apply settings live: swap music in gesture handler + restart interval
  const handleSlideshowSettingsApply = useCallback((track: MusicTrack, intervalMs: number) => {
    setSelectedTrack(track);
    setSlideshowIntervalMs(intervalMs);
    // Stop old audio
    if (slideshowSoundRef.current) {
      slideshowSoundRef.current.remove();
      slideshowSoundRef.current = null;
    }
    if (slideshowWebAudioRef.current) {
      slideshowWebAudioRef.current.pause();
      slideshowWebAudioRef.current.src = '';
      slideshowWebAudioRef.current = null;
    }
    // Start new audio in this gesture handler (required for PWA)
    if (Platform.OS === 'web') {
      unlockWebAudio();
      const audio = createWebAudioPlayer(getMusicUrl(track), { loop: true, volume: 0.5 });
      audio.play().catch((e) => console.warn('Audio play failed:', e));
      slideshowWebAudioRef.current = audio;
    } else {
      try {
        const player = createAudioPlayer(getMusicUrl(track));
        player.loop = true;
        player.volume = 0.5;
        player.play();
        slideshowSoundRef.current = player;
      } catch (e) {
        console.warn('Audio play failed:', e);
      }
    }
  }, []);

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
        <Image
          source={item.thumbnail_url || item.url}
          style={styles.photo}
          contentFit="cover"
          transition={200}
          recyclingKey={item.id}
          cachePolicy="memory-disk"
        />
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
        {!selectMode && item.source === 'unsplash' && (
          <View style={styles.unsplashBadge}>
            <Text style={styles.unsplashBadgeText}>Unsplash</Text>
          </View>
        )}
        {selectMode && (
          <View style={[styles.selectOverlay, isSelected && styles.selectOverlayActive]}>
            <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
              {isSelected && <Icon name="checkmark" size={16} color="#FFFFFF" />}
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Inspiration photos
  const inspirationPhotosExist = useMemo(() => photos.some(p => p.source === 'unsplash'), [photos]);

  const handleInsertInspirationPhotos = async () => {
    if (!user || inspirationLocations.length === 0) return;
    if (inspirationPhotosExist) {
      await removeInspirationPhotos(tripId);
    }
    setInspirationLoading(true);
    try {
      await insertInspirationPhotos(tripId, user.id, inspirationLocations);
      await loadPhotos();
      showToast('Inspirationsfotos hinzugefügt');
    } catch {
      showToast('Fehler beim Laden der Fotos', 'error');
    } finally { setInspirationLoading(false); }
  };

  // Free user on shared trip → can see but not edit
  const isSharedReadonly = !isPremium && !!trip && trip.owner_id !== user?.id;
  const photosSneakPeek = isSneakPeek('photos', photos.length > 0);
  const readonlyMode = photosSneakPeek || isSharedReadonly;

  if (!isFeatureAllowed('photos') && !readonlyMode && !isSharedReadonly) {
    return (
      <View style={styles.container}>
        <Header title="Fotos" onBack={() => navigation.navigate('TripDetail', { tripId })} />
        <UpgradePrompt
          iconName="images-outline"
          title="Foto-Galerie"
          message="Halte deine schönsten Reisemomente fest — sortiert nach Tag, auf der Karte sichtbar"
          heroGradient={['#FF6B6B', '#FF8B94']}
          highlights={[
            { icon: 'cloud-upload-outline', text: 'Unbegrenzt Fotos hochladen', detail: 'Direkt von der Kamera oder Galerie' },
            { icon: 'calendar-outline', text: 'Nach Tag sortiert', detail: 'EXIF-Datum wird dem Reisetag zugeordnet' },
            { icon: 'map-outline', text: 'Foto-Karte', detail: 'Alle Fotos auf der Karte sichtbar' },
            { icon: 'play-circle-outline', text: 'Diashow & Teilen', detail: 'Slideshow mit Musik, gemeinsames Album' },
          ]}
        />
      </View>
    );
  }

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
          rightAction={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              {!readonlyMode && inspirationLocations.length > 0 && (
                <TouchableOpacity
                  onPress={() => setShowInspirationModal(true)}
                  disabled={inspirationLoading}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={inspirationLoading ? { opacity: 0.5 } : undefined}
                >
                  <Icon name="image-outline" size={22} color={colors.secondary} />
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {readonlyMode && <SneakPeekOverlay feature="Fotos" />}

      {/* Toolbar */}
      {!loading && photos.length > 0 && !readonlyMode && (
        <View style={styles.toolbar}>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => setSortOrder(prev => {
              const next = prev === 'newest' ? 'oldest' : 'newest';
              if (Platform.OS === 'web') { try { localStorage.setItem('photos_sort_order', next); } catch {} }
              return next;
            })}
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
                    <Icon name="share-outline" size={16} color={colors.secondary} />
                    <Text style={styles.bulkText}>Teilen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.bulkAction, styles.bulkDelete]} onPress={handleBulkDelete} disabled={bulkProcessing}>
                    <Icon name="trash-outline" size={16} color={colors.error} />
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
              {geoPhotos.length > 0 && Platform.OS !== 'web' && (
                <TouchableOpacity
                  style={[styles.viewToggle, viewMode === 'map' && styles.viewToggleActive]}
                  onPress={() => setViewMode(v => v === 'grid' ? 'map' : 'grid')}
                  activeOpacity={0.7}
                >
                  <Icon name={viewMode === 'grid' ? 'map-outline' : 'grid-outline'} size={16} color={viewMode === 'map' ? '#FFFFFF' : colors.textSecondary} />
                </TouchableOpacity>
              )}
              {photoStats.days > 1 && (
                <Text style={styles.statsText}>{photoStats.count} Fotos · {photoStats.days} Tage</Text>
              )}
              {flatPhotos.length >= 3 && viewMode === 'grid' && (
                <TouchableOpacity
                  style={styles.slideshowButton}
                  onPress={() => { openViewer(flatPhotos[0]); startSlideshow(); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.slideshowButtonText}>▶ Diashow</Text>
                </TouchableOpacity>
              )}
              {viewMode === 'grid' && (
                <TouchableOpacity style={styles.selectButton} onPress={() => setSelectMode(true)} activeOpacity={0.7}>
                  <Text style={styles.selectButtonText}>Auswählen</Text>
                </TouchableOpacity>
              )}
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
      {uploading && (
        <View style={styles.uploadBanner}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.uploadBannerText}>
            {uploadProgress.total > 1
              ? `Lade hoch ${uploadProgress.current}/${uploadProgress.total}...`
              : 'Lade Foto hoch...'}
          </Text>
          {uploadProgress.total > 1 && (
            <View style={styles.uploadProgressBar}>
              <View style={[styles.uploadProgressFill, { width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }]} />
            </View>
          )}
        </View>
      )}

      {/* Content */}
      {loading ? (
        <PhotosSkeleton />
      ) : photos.length === 0 ? (
        <EmptyState
          iconName="camera-outline"
          title="Keine Fotos"
          message="Lade Fotos hoch, um deine Reiseerinnerungen festzuhalten"
          actionLabel="Foto hochladen"
          onAction={handleUpload}
        />
      ) : viewMode === 'map' && geoPhotos.length > 0 ? (
        <PhotoMapView photos={geoPhotos} onPhotoPress={openViewer} />
      ) : (
        <FlatList
          data={sortedPhotos}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          numColumns={COLUMNS}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.columnWrapper}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadPhotos} tintColor={colors.primary} />}
        />
      )}

      {/* Upload FAB */}
      {!selectMode && !readonlyMode && (
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
              <Icon name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.viewerCounter}>
              {slideshowActive ? 'Diashow' : flatPhotos.length > 0 ? `${viewerIndex + 1} / ${flatPhotos.length}` : ''}
            </Text>
            <View style={styles.viewerTopActions}>
              {flatPhotos.length >= 3 && (
                <TouchableOpacity style={styles.viewerBtn} onPress={slideshowActive ? stopSlideshow : startSlideshow}>
                  <Icon name={slideshowActive ? 'pause' : 'play'} size={20} color="#FFFFFF" />
                </TouchableOpacity>
              )}
              {slideshowActive && (
                <TouchableOpacity style={styles.viewerBtn} onPress={() => setShowSlideshowSettings(true)}>
                  <Icon name="settings-outline" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              )}
              {selectedPhoto && (
                <TouchableOpacity
                  style={styles.viewerBtn}
                  onPress={slideshowActive
                    ? () => { stopSlideshow(); setShowSlideshowShare(true); }
                    : () => handleSingleExport(selectedPhoto)
                  }
                >
                  <Icon name={slideshowActive ? 'link-outline' : 'share-outline'} size={20} color="#FFFFFF" />
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

          {/* Intro slide (fades out to reveal first photo beneath) */}
          {slideshowActive && showIntro && (
            <Animated.View style={[styles.introSlide, { opacity: introFadeAnim, zIndex: 2 }]}>
              {trip?.cover_image_url ? (
                <>
                  <Image source={trip.cover_image_url} style={styles.introCoverImage} contentFit="cover" />
                  <View style={styles.introCoverOverlay} />
                </>
              ) : (
                <LinearGradient colors={[...gradients.sunset]} style={StyleSheet.absoluteFillObject} />
              )}
              <View style={styles.introContent}>
                {trip?.destination && (
                  <Text style={styles.introDestination}>{trip.destination}</Text>
                )}
                <Text style={styles.introTitle}>{tripName || 'Diashow'}</Text>
                {trip?.start_date && trip?.end_date && (
                  <Text style={styles.introDate}>{formatDateRange(trip.start_date, trip.end_date)}</Text>
                )}
                <Text style={styles.introLogo}>WayFable</Text>
              </View>
            </Animated.View>
          )}

          {/* Image + navigation (always rendered during slideshow so it's visible beneath intro fade) */}
          {selectedPhoto && (
            <View style={styles.viewerContent} {...panResponder.panHandlers}>
              {/* Base image — always fully visible */}
              <Image
                source={selectedPhoto.url}
                style={styles.viewerImage}
                contentFit="contain"
                transition={slideshowActive ? 0 : 300}
                placeholder={selectedPhoto.thumbnail_url || undefined}
                cachePolicy="memory-disk"
              />
              {/* Crossfade overlay — next image fades in on top */}
              {crossfadeUrl && (
                <Animated.View style={[styles.crossfadeOverlay, { opacity: fadeAnim }]}>
                  <Image
                    source={crossfadeUrl}
                    style={styles.viewerImage}
                    contentFit="contain"
                    transition={0}
                    cachePolicy="memory-disk"
                  />
                </Animated.View>
              )}
              {viewerIndex > 0 && !slideshowActive && (
                <TouchableOpacity style={[styles.viewerNav, styles.viewerNavLeft]} onPress={() => viewerGo(-1)}>
                  <Text style={styles.viewerNavText}>‹</Text>
                </TouchableOpacity>
              )}
              {viewerIndex < flatPhotos.length - 1 && !slideshowActive && (
                <TouchableOpacity style={[styles.viewerNav, styles.viewerNavRight]} onPress={() => viewerGo(1)}>
                  <Text style={styles.viewerNavText}>›</Text>
                </TouchableOpacity>
              )}
            </View>
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
                {selectedPhoto.source === 'unsplash' && selectedPhoto.unsplash_attribution && (() => {
                  const [name, profileUrl, photoUrl] = selectedPhoto.unsplash_attribution!.split('|');
                  return (
                    <Text style={styles.unsplashCredit}>
                      Foto von{' '}
                      <Text style={styles.unsplashCreditLink} onPress={() => Linking.openURL(`${profileUrl}?utm_source=wayfable&utm_medium=referral`)}>
                        {name}
                      </Text>
                      {' '}auf{' '}
                      <Text style={styles.unsplashCreditLink} onPress={() => Linking.openURL(`${photoUrl}?utm_source=wayfable&utm_medium=referral`)}>
                        Unsplash
                      </Text>
                    </Text>
                  );
                })()}
              </View>
              <TouchableOpacity style={styles.viewerDeleteBtn} onPress={() => handleDelete(selectedPhoto)} disabled={deleting}>
                {deleting
                  ? <ActivityIndicator size="small" color={colors.error} />
                  : <Text style={styles.viewerDeleteText}>Löschen</Text>}
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>

      <SlideshowShareModal
        visible={showSlideshowShare}
        onClose={() => setShowSlideshowShare(false)}
        tripId={tripId}
        tripName={tripName}
        photoIds={flatPhotos.map(p => p.id)}
        initialTrack={selectedTrack}
        initialInterval={slideshowIntervalMs}
      />

      <SlideshowShareModal
        visible={showSlideshowSettings}
        onClose={() => setShowSlideshowSettings(false)}
        mode="settings"
        tripId={tripId}
        tripName={tripName}
        photoIds={flatPhotos.map(p => p.id)}
        initialTrack={selectedTrack}
        initialInterval={slideshowIntervalMs}
        onApply={handleSlideshowSettingsApply}
      />

      {/* Inspiration photos confirmation modal */}
      <Modal visible={showInspirationModal} transparent animationType="fade" onRequestClose={() => setShowInspirationModal(false)}>
        <TouchableOpacity style={styles.inspirationOverlay} activeOpacity={1} onPress={() => setShowInspirationModal(false)}>
          <TouchableOpacity style={styles.inspirationSheet} activeOpacity={1} onPress={() => {}}>
            <Icon name="image-outline" size={32} color={colors.secondary} style={{ alignSelf: 'center', marginBottom: spacing.sm }} />
            <Text style={styles.inspirationTitle}>
              {inspirationPhotosExist ? 'Inspirationsfotos erneuern?' : 'Inspirationsfotos hinzufügen?'}
            </Text>
            <Text style={styles.inspirationDesc}>
              {inspirationPhotosExist
                ? 'Die bestehenden Inspirationsfotos werden durch neue ersetzt. Es werden pro Reiseziel 2 passende Fotos von Unsplash geladen.'
                : `Es werden pro Reiseziel 2 passende Fotos von Unsplash geladen — basierend auf deinen ${inspirationLocations.length} Unterkünften. So bekommst du einen visuellen Vorgeschmack auf deine Reise.`}
            </Text>
            <View style={styles.inspirationActions}>
              <TouchableOpacity style={styles.inspirationCancelBtn} onPress={() => setShowInspirationModal(false)}>
                <Text style={styles.inspirationCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.inspirationConfirmBtn}
                onPress={() => { setShowInspirationModal(false); handleInsertInspirationPhotos(); }}
              >
                <Text style={styles.inspirationConfirmText}>
                  {inspirationPhotosExist ? 'Erneuern' : 'Hinzufügen'}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Header

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
  unsplashBadge: {
    position: 'absolute' as const, top: 4, left: 4,
    backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 4, paddingVertical: 1,
    borderRadius: 4,
  },
  unsplashBadgeText: { color: '#fff', fontSize: 8, fontWeight: '500' as const },

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

  // View toggle
  viewToggle: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  viewToggleActive: { backgroundColor: colors.secondary },

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
    zIndex: 10,
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
    zIndex: 10,
  },
  slideshowProgressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 2 },

  viewerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', position: 'relative' as const },
  crossfadeOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
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

  unsplashCredit: { ...typography.caption, color: 'rgba(255,255,255,0.5)', marginTop: 4 },
  unsplashCreditLink: { color: 'rgba(255,255,255,0.7)', textDecorationLine: 'underline' as const },

  viewerDeleteBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full, backgroundColor: 'rgba(225,112,85,0.2)',
    marginLeft: spacing.md,
  },
  viewerDeleteText: { ...typography.bodySmall, color: colors.error, fontWeight: '600' },

  // Intro slide
  introSlide: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  introCoverImage: { ...StyleSheet.absoluteFillObject } as any,
  introCoverOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  introContent: { zIndex: 1, alignItems: 'center', padding: spacing.xl },
  introDestination: {
    ...typography.bodySmall, color: 'rgba(255,255,255,0.7)', fontWeight: '600' as const,
    letterSpacing: 2, textTransform: 'uppercase' as const, textAlign: 'center' as const,
  },
  introTitle: {
    ...typography.h1, color: '#fff', fontWeight: '800' as const,
    textAlign: 'center' as const, marginTop: spacing.xs,
  },
  introDate: {
    ...typography.body, color: 'rgba(255,255,255,0.6)',
    marginTop: spacing.sm, textAlign: 'center' as const,
  },
  introLogo: {
    ...typography.caption, color: 'rgba(255,255,255,0.3)', fontWeight: '700' as const,
    letterSpacing: 1, marginTop: spacing.xl,
  },
  inspirationOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl,
  },
  inspirationSheet: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.xl, width: '100%', maxWidth: 380,
  },
  inspirationTitle: {
    ...typography.h3, textAlign: 'center', marginBottom: spacing.sm,
  },
  inspirationDesc: {
    ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: spacing.lg,
  },
  inspirationActions: {
    flexDirection: 'row', gap: spacing.md,
  },
  inspirationCancelBtn: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.md, backgroundColor: colors.background, alignItems: 'center',
  },
  inspirationCancelText: {
    ...typography.body, fontWeight: '600', color: colors.textSecondary,
  },
  inspirationConfirmBtn: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.md, backgroundColor: colors.secondary, alignItems: 'center',
  },
  inspirationConfirmText: {
    ...typography.body, fontWeight: '600', color: '#FFFFFF',
  },
});
