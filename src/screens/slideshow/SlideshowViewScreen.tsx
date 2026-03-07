import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator,
  Dimensions, Platform, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { Audio } from 'expo-av';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../types/navigation';
import { getSharedSlideshow, SlideshowShareData } from '../../api/slideshows';
import { Icon } from '../../utils/icons';
import { colors, spacing, typography, borderRadius } from '../../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SlideshowView'>;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export const SlideshowViewScreen: React.FC<Props> = ({ route }) => {
  const { token } = route.params;
  const [data, setData] = useState<SlideshowShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showCta, setShowCta] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const soundRef = useRef<Audio.Sound | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const photoIndexRef = useRef(0);

  // Load slideshow data
  useEffect(() => {
    (async () => {
      try {
        const result = await getSharedSlideshow(token);
        setData(result);
      } catch (e: any) {
        setError(e.message || 'Diashow nicht gefunden');
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      if (soundRef.current) soundRef.current.unloadAsync();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token]);

  // Start slideshow + music
  const handleStart = useCallback(async () => {
    if (!data) return;
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: data.music_url },
        { shouldPlay: true, isLooping: true, volume: 0.6 }
      );
      soundRef.current = sound;
    } catch {}
    setStarted(true);
  }, [data]);

  // Advance slideshow
  const advance = useCallback(() => {
    if (!data) return;
    Animated.timing(fadeAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
      const currentIdx = photoIndexRef.current;
      const next = currentIdx + 1;
      if (next >= data.photos.length) {
        photoIndexRef.current = 0;
        setPhotoIndex(0);
        setShowCta(true);
      } else {
        photoIndexRef.current = next;
        setPhotoIndex(next);
      }
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    });
  }, [data, fadeAnim]);

  // Run interval
  useEffect(() => {
    if (!started || !data || paused || showCta) return;
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 1, duration: data.interval_ms, useNativeDriver: false,
    }).start();
    intervalRef.current = setInterval(() => {
      advance();
      progressAnim.setValue(0);
      Animated.timing(progressAnim, {
        toValue: 1, duration: data.interval_ms, useNativeDriver: false,
      }).start();
    }, data.interval_ms);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [started, data, paused, showCta, advance, progressAnim]);

  // Toggle mute
  const toggleMute = async () => {
    if (soundRef.current) {
      await soundRef.current.setIsMutedAsync(!muted);
      setMuted(!muted);
    }
  };

  // Toggle pause
  const togglePause = async () => {
    if (paused) {
      soundRef.current?.playAsync();
    } else {
      soundRef.current?.pauseAsync();
    }
    setPaused(!paused);
  };

  // Dismiss CTA
  const dismissCta = () => {
    setShowCta(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <Icon name="sad-outline" size={48} color="rgba(255,255,255,0.5)" />
        <Text style={styles.errorText}>{error || 'Diashow nicht gefunden'}</Text>
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => Linking.openURL('https://wayfable.ch')}
        >
          <Text style={styles.ctaButtonText}>Zu WayFable</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Start screen
  if (!started) {
    return (
      <TouchableOpacity style={styles.center} onPress={handleStart} activeOpacity={0.9}>
        <Icon name="play-circle-outline" size={72} color="rgba(255,255,255,0.8)" />
        {data.trip_name && (
          <Text style={styles.tripNameStart}>{data.trip_name}</Text>
        )}
        <Text style={styles.tapHint}>Antippen zum Starten</Text>
        <Text style={styles.photoCount}>{data.photos.length} Fotos</Text>
      </TouchableOpacity>
    );
  }

  // CTA overlay
  if (showCta) {
    return (
      <View style={styles.center}>
        <Text style={styles.ctaTitle}>Plane deine eigene Reise</Text>
        <Text style={styles.ctaSubtitle}>mit WayFable</Text>
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => Linking.openURL('https://wayfable.ch')}
        >
          <Text style={styles.ctaButtonText}>Jetzt entdecken</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={dismissCta} style={styles.ctaDismiss}>
          <Text style={styles.ctaDismissText}>Diashow fortsetzen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Slideshow
  const photo = data.photos[photoIndex];

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, {
          width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }]} />
      </View>

      {/* Photo */}
      <Animated.View style={[styles.photoContainer, { opacity: fadeAnim }]}>
        <Image source={photo.url} style={styles.photo} contentFit="contain" transition={300} />
      </Animated.View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlBtn} onPress={togglePause}>
          <Icon name={paused ? 'play' : 'pause'} size={20} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlBtn} onPress={toggleMute}>
          <Icon name={muted ? 'volume-mute' : 'volume-high'} size={20} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
      </View>

      {/* Counter */}
      <Text style={styles.counter}>{photoIndex + 1} / {data.photos.length}</Text>

      {/* Logo */}
      <Text style={styles.logo}>WayFable</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center',
    padding: spacing.xl,
  },
  progressTrack: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
    backgroundColor: 'rgba(255,255,255,0.15)', zIndex: 10,
  },
  progressFill: { height: '100%', backgroundColor: colors.primary },
  photoContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  photo: { width: '100%', height: '100%' },
  controls: {
    position: 'absolute', bottom: Platform.OS === 'web' ? spacing.lg : 40,
    right: spacing.lg, flexDirection: 'row', gap: spacing.sm,
  },
  controlBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  counter: {
    position: 'absolute', top: spacing.lg, right: spacing.lg,
    ...typography.caption, color: 'rgba(255,255,255,0.5)',
  },
  logo: {
    position: 'absolute', bottom: Platform.OS === 'web' ? spacing.lg : 40,
    left: spacing.lg, ...typography.caption, color: 'rgba(255,255,255,0.3)',
    fontWeight: '700', letterSpacing: 1,
  },
  errorText: {
    ...typography.body, color: 'rgba(255,255,255,0.7)', textAlign: 'center',
    marginTop: spacing.md,
  },
  tripNameStart: {
    ...typography.h2, color: '#fff', fontWeight: '700' as const, marginTop: spacing.lg,
    textAlign: 'center',
  },
  tapHint: {
    ...typography.body, color: 'rgba(255,255,255,0.5)', marginTop: spacing.sm,
  },
  photoCount: {
    ...typography.caption, color: 'rgba(255,255,255,0.3)', marginTop: spacing.xs,
  },
  ctaTitle: { ...typography.h2, color: '#fff', fontWeight: '700' as const, textAlign: 'center' },
  ctaSubtitle: {
    ...typography.h3, color: colors.primary, fontWeight: '600' as const, marginTop: spacing.xs,
  },
  ctaButton: {
    backgroundColor: colors.primary, paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md, borderRadius: borderRadius.md, marginTop: spacing.xl,
  },
  ctaButtonText: { ...typography.body, color: '#fff', fontWeight: '700' as const },
  ctaDismiss: { marginTop: spacing.lg },
  ctaDismissText: { ...typography.bodySmall, color: 'rgba(255,255,255,0.4)' },
});
