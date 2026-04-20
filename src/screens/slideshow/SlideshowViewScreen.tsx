import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator,
  Dimensions, Platform, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import { unlockWebAudio, lockWebAudio, createWebAudioPlayer } from '../../utils/webAudioUnlock';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../types/navigation';
import { getSharedSlideshow, SlideshowShareData } from '../../api/slideshows';
import { formatDateRange } from '../../utils/dateHelpers';
import { Icon } from '../../utils/icons';
import { colors, spacing, typography, borderRadius, gradients } from '../../utils/theme';
import { logError } from '../../services/errorLogger';

type Props = NativeStackScreenProps<RootStackParamList, 'SlideshowView'>;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export const SlideshowViewScreen: React.FC<Props> = ({ route }) => {
  const { token } = route.params;
  const [data, setData] = useState<SlideshowShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showCta, setShowCta] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const introFadeAnim = useRef(new Animated.Value(1)).current;
  const outroFadeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const soundRef = useRef<AudioPlayer | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const photoIndexRef = useRef(0);

  // Load slideshow data
  useEffect(() => {
    (async () => {
      try {
        const result = await getSharedSlideshow(token);
        setData(result);
      } catch (e: any) {
        logError(e, { component: 'SlideshowViewScreen', context: { action: 'loadSlideshow' } });
        setError(e.message || 'Diashow nicht gefunden');
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      if (soundRef.current) soundRef.current.remove();
      if (webAudioRef.current) { webAudioRef.current.pause(); webAudioRef.current.src = ''; }
      if (intervalRef.current) clearInterval(intervalRef.current);
      lockWebAudio();
    };
  }, [token]);

  // Start slideshow + music
  const handleStart = useCallback(async () => {
    if (!data) return;
    try {
      if (Platform.OS === 'web') {
        // Unlock iOS audio session on this user gesture (also resumes AudioContext on all browsers)
        unlockWebAudio();
        // Use HTMLAudioElement directly — more reliable than expo-audio on web/iOS
        const audio = createWebAudioPlayer(data.music_url, { loop: true, volume: 0.6 });
        await audio.play();
        webAudioRef.current = audio;
      } else {
        const player = createAudioPlayer(data.music_url);
        player.loop = true;
        player.volume = 0.6;
        player.play();
        soundRef.current = player;
      }
    } catch (e) {
      logError(e, { component: 'SlideshowViewScreen', context: { action: 'handleStart' } });
      console.warn('Slideshow audio failed:', e);
    }
    setStarted(true);
  }, [data]);

  // Preload images: during intro preload first photo, during slideshow preload next
  useEffect(() => {
    if (!started || !data || data.photos.length === 0) return;
    // During intro, preload the first photo so it's ready when intro ends
    if (showIntro) {
      if (data.photos[0]?.url && Platform.OS === 'web') {
        const img = new window.Image();
        img.src = data.photos[0].url;
      }
      return;
    }
    const nextIdx = photoIndexRef.current + 1;
    const nextPhoto = nextIdx >= data.photos.length ? data.photos[0] : data.photos[nextIdx];
    if (nextPhoto?.url && Platform.OS === 'web') {
      const img = new window.Image();
      img.src = nextPhoto.url;
    }
  }, [started, data, showIntro, photoIndex]);

  // Crossfade: next image fades in over current
  const [crossfadeUrl, setCrossfadeUrl] = useState<string | null>(null);

  const advance = useCallback(() => {
    if (!data) return;
    const currentIdx = photoIndexRef.current;
    const next = currentIdx + 1;

    if (next >= data.photos.length) {
      // End of slideshow — fade in CTA over last photo
      outroFadeAnim.setValue(0);
      setShowCta(true);
      Animated.timing(outroFadeAnim, {
        toValue: 1, duration: 1000, useNativeDriver: false,
      }).start();
      return;
    }

    // Set next image on overlay, start transparent
    setCrossfadeUrl(data.photos[next].url);
    fadeAnim.setValue(0);

    // Fade in the next image over the current
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: false }).start(() => {
      // Swap base image first (overlay still covers it)
      photoIndexRef.current = next;
      setPhotoIndex(next);
      // Clear overlay on next frame so base has rendered the new image
      requestAnimationFrame(() => {
        setCrossfadeUrl(null);
        fadeAnim.setValue(1);
      });
    });
  }, [data, fadeAnim]);

  // Intro timer + run interval
  useEffect(() => {
    if (!started || !data || showCta) return;

    if (showIntro) {
      // Show intro slide for interval_ms, then fade out to reveal first photo
      introFadeAnim.setValue(1);
      progressAnim.setValue(0);
      Animated.timing(progressAnim, {
        toValue: 1, duration: data.interval_ms, useNativeDriver: false,
      }).start();
      const introTimer = setTimeout(() => {
        Animated.timing(introFadeAnim, {
          toValue: 0, duration: 800, useNativeDriver: false,
        }).start(() => {
          setShowIntro(false);
          introFadeAnim.setValue(1);
        });
      }, data.interval_ms);
      return () => clearTimeout(introTimer);
    }

    if (paused) return;

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
  }, [started, data, paused, showCta, showIntro, advance, progressAnim]);

  // Toggle mute
  const toggleMute = () => {
    const next = !muted;
    if (Platform.OS === 'web' && webAudioRef.current) {
      webAudioRef.current.muted = next;
    } else if (soundRef.current) {
      soundRef.current.muted = next;
    }
    setMuted(next);
  };

  // Toggle pause
  const togglePause = () => {
    if (Platform.OS === 'web' && webAudioRef.current) {
      paused ? webAudioRef.current.play() : webAudioRef.current.pause();
    } else {
      paused ? soundRef.current?.play() : soundRef.current?.pause();
    }
    setPaused(!paused);
  };

  // Dismiss CTA — restart from beginning
  const dismissCta = () => {
    photoIndexRef.current = 0;
    setPhotoIndex(0);
    setShowCta(false);
    outroFadeAnim.setValue(0);
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

  // CTA is now rendered as overlay in main return

  // Slideshow (with intro overlay + outro)
  const photo = data.photos[photoIndex];

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, {
          width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }]} />
      </View>

      {/* Photo (always rendered so it's visible beneath intro fade) */}
      <View style={styles.photoContainer}>
        <Image source={photo.url} style={styles.photo} contentFit="contain" transition={0} />
        {crossfadeUrl && (
          <Animated.View style={[styles.crossfadeOverlay, { opacity: fadeAnim }]}>
            <Image source={crossfadeUrl} style={styles.photo} contentFit="contain" transition={0} />
          </Animated.View>
        )}
      </View>

      {/* Intro overlay — fades out to reveal first photo */}
      {showIntro && (
        <Animated.View style={[styles.introOverlayContainer, { opacity: introFadeAnim }]}>
          {data.trip_cover_image_url ? (
            <>
              <Image source={data.trip_cover_image_url} style={styles.introCoverImage} contentFit="cover" />
              <View style={styles.introCoverOverlay} />
            </>
          ) : (
            <LinearGradient colors={[...gradients.sunset]} style={StyleSheet.absoluteFillObject} />
          )}
          <View style={styles.introContent}>
            {data.trip_destination && (
              <Text style={styles.introDestination}>{data.trip_destination}</Text>
            )}
            <Text style={styles.introTitle}>{data.trip_name || 'Diashow'}</Text>
            {data.trip_start_date && data.trip_end_date && (
              <Text style={styles.introDate}>{formatDateRange(data.trip_start_date, data.trip_end_date)}</Text>
            )}
            <Text style={styles.introLogo}>WayFable</Text>
          </View>
        </Animated.View>
      )}

      {/* Outro / CTA overlay — fades in over last photo */}
      {showCta && (
        <Animated.View style={[styles.outroOverlay, { opacity: outroFadeAnim }]}>
          <LinearGradient colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.95)']} style={StyleSheet.absoluteFillObject} />
          <View style={styles.introContent}>
            <Text style={styles.outroLogo}>WayFable</Text>
            <Text style={styles.ctaTitle}>Plane deine eigene Reise</Text>
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={() => Linking.openURL('https://wayfable.ch')}
            >
              <Text style={styles.ctaButtonText}>Jetzt entdecken</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={dismissCta} style={styles.ctaDismiss}>
              <Text style={styles.ctaDismissText}>Diashow nochmals abspielen</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        {!showIntro && !showCta && (
          <TouchableOpacity style={styles.controlBtn} onPress={togglePause}>
            <Icon name={paused ? 'play' : 'pause'} size={20} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.controlBtn} onPress={toggleMute}>
          <Icon name={muted ? 'volume-mute' : 'volume-high'} size={20} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
      </View>

      {/* Counter */}
      {!showIntro && (
        <Text style={styles.counter}>{photoIndex + 1} / {data.photos.length}</Text>
      )}

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
  photoContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', position: 'relative' as const },
  crossfadeOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
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

  // Intro slide
  introOverlayContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 5 },
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

  // Outro
  outroOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 5 },
  outroLogo: {
    ...typography.h1, color: '#fff', fontWeight: '800' as const, letterSpacing: 2,
    marginBottom: spacing.lg, textAlign: 'center' as const,
  },
});
