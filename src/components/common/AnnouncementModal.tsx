import React, { useEffect, useState, useCallback } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, Platform, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { getActiveAnnouncements, getDismissedAnnouncementIds, dismissAnnouncement } from '../../api/announcements';
import { colors, spacing, borderRadius, typography, gradients } from '../../utils/theme';
import { Announcement } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';

export const AnnouncementModal: React.FC = () => {
  const { isTrialExpired, isPremium } = useSubscription();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [active, dismissedIds] = await Promise.all([
          getActiveAnnouncements(),
          getDismissedAnnouncementIds(),
        ]);

        const undismissed = active.filter((a) => !dismissedIds.includes(a.id));

        // Filter by target audience
        const matching = undismissed.filter((a) => {
          if (a.target_audience === 'all') return true;
          if (a.target_audience === 'premium' && isPremium) return true;
          if (a.target_audience === 'free' && !isPremium) return true;
          return false;
        });

        // Show highest priority
        if (matching.length > 0) {
          setAnnouncement(matching[0]);
        }
      } catch (e) {
        console.error('Announcements load error:', e);
      } finally {
        setLoaded(true);
      }
    };
    load();
  }, [isPremium]);

  const handleDismiss = useCallback(async () => {
    if (!announcement) return;
    try {
      await dismissAnnouncement(announcement.id);
    } catch (e) {
      console.error('Dismiss error:', e);
    }
    setAnnouncement(null);
  }, [announcement]);

  const handleCta = useCallback(async () => {
    if (!announcement) return;
    const url = announcement.cta_url;

    // Dismiss first
    try {
      await dismissAnnouncement(announcement.id);
    } catch (e) {
      console.error('Dismiss error:', e);
    }
    setAnnouncement(null);

    // Navigate if it's an internal route
    if (url) {
      if (url.startsWith('/')) {
        // Simple internal path mapping
        const route = url.slice(1);
        if (route === 'subscription') navigation.navigate('Subscription');
        else if (route === 'profile') navigation.navigate('Main', { screen: 'Profile' } as any);
        else if (route === 'feedback') navigation.navigate('FeedbackModal');
        else if (Platform.OS === 'web') window.open(url, '_blank');
      } else if (Platform.OS === 'web') {
        window.open(url, '_blank');
      }
    }
  }, [announcement, navigation]);

  // Escape key to dismiss (web only)
  useEffect(() => {
    if (Platform.OS !== 'web' || !announcement) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [announcement, handleDismiss]);

  // Don't render if trial expired modal is active, not loaded, or no announcement
  if (isTrialExpired || !loaded || !announcement) return null;

  return (
    <Modal transparent animationType="fade" visible>
      <Pressable style={styles.overlay} onPress={handleDismiss}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <LinearGradient colors={[...gradients.sunset]} style={styles.gradient}>
            {announcement.image_url ? (
              <Image source={{ uri: announcement.image_url }} style={styles.image} resizeMode="contain" />
            ) : (
              <Text style={styles.icon}>{'📢'}</Text>
            )}
            <Text style={styles.title}>{announcement.title}</Text>
            <Text style={styles.message}>{announcement.body}</Text>
          </LinearGradient>
          <View style={styles.actions}>
            {announcement.cta_text && announcement.cta_url && (
              <TouchableOpacity style={styles.ctaBtn} onPress={handleCta}>
                <LinearGradient
                  colors={[...gradients.sunset]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.ctaBtnGradient}
                >
                  <Text style={styles.ctaBtnText}>{announcement.cta_text}</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.dismissBtn} onPress={handleDismiss}>
              <Text style={styles.dismissBtnText}>Schliessen</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    maxWidth: 480,
    width: Platform.OS === 'web' ? '90%' : '100%',
  },
  gradient: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  icon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  image: {
    width: 200,
    height: 120,
    marginBottom: spacing.md,
    borderRadius: borderRadius.sm,
  },
  title: {
    ...typography.h2,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 24,
  },
  actions: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  ctaBtn: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  ctaBtnGradient: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.md,
  },
  ctaBtnText: {
    ...typography.button,
    color: '#FFFFFF',
  },
  dismissBtn: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  dismissBtnText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
