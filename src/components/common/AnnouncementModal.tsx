import React, { useEffect, useState, useCallback } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, Platform, Image, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { getActiveAnnouncements, getDismissedAnnouncementIds, dismissAnnouncement } from '../../api/announcements';
import { supabase } from '../../api/supabase';
import { colors, spacing, borderRadius, typography, gradients } from '../../utils/theme';
import { Icon } from '../../utils/icons';
import { Announcement } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { logError } from '../../services/errorLogger';

const PWA_ANNOUNCEMENT_TITLE = 'WayFable als App installieren';

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
        logError(e, { component: 'AnnouncementModal', context: { action: 'load' } });
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
      logError(e, { component: 'AnnouncementModal', context: { action: 'handleDismiss' } });
      console.error('Dismiss error:', e);
    }
    setAnnouncement(null);
  }, [announcement]);

  const handleCta = useCallback(async () => {
    if (!announcement) return;
    let url = announcement.cta_url;

    // Dismiss first
    try {
      await dismissAnnouncement(announcement.id);
    } catch (e) {
      logError(e, { component: 'AnnouncementModal', context: { action: 'handleCta' } });
      console.error('Dismiss error:', e);
    }
    setAnnouncement(null);

    if (!url) return;

    // Resolve {latestTrip} placeholder with user's most recent trip
    if (url.includes('{latestTrip}')) {
      try {
        const { data } = await supabase
          .from('trips')
          .select('id')
          .order('start_date', { ascending: false })
          .limit(1)
          .single();
        if (data?.id) {
          url = url.replace('{latestTrip}', data.id);
        } else {
          // No trip — fallback to home
          return;
        }
      } catch (e) {
        logError(e, { component: 'AnnouncementModal', context: { action: 'resolveLatestTrip' } });
        return;
      }
    }

    // Navigate based on route type
    if (url.startsWith('/')) {
      const route = url.slice(1);
      // Trip sub-routes: /trip/{id}/budget, /trip/{id}/packing, etc.
      const tripMatch = route.match(/^trip\/([^/]+)(?:\/(.+))?$/);
      if (tripMatch) {
        const [, tripId, subRoute] = tripMatch;
        const screenMap: Record<string, string> = {
          budget: 'Budget', packing: 'Packing', itinerary: 'Itinerary',
          photos: 'Photos', stops: 'Stops', map: 'Map',
        };
        const screen = subRoute ? screenMap[subRoute] : undefined;
        if (screen) {
          navigation.navigate(screen as any, { tripId } as any);
        } else {
          navigation.navigate('TripDetail', { tripId } as any);
        }
      } else if (route === 'subscription') navigation.navigate('Subscription');
      else if (route === 'profile') navigation.navigate('Main', { screen: 'Profile' } as any);
      else if (route === 'feedback') navigation.navigate('FeedbackModal');
      else if (Platform.OS === 'web') window.open(url, '_blank');
    } else if (Platform.OS === 'web') {
      window.open(url, '_blank');
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

  const isPwaAnnouncement = announcement.title === PWA_ANNOUNCEMENT_TITLE;

  // PWA install modal — custom layout with step-by-step instructions
  if (isPwaAnnouncement && Platform.OS === 'web') {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isAndroid = /android/i.test(navigator.userAgent);

    return (
      <Modal transparent animationType="fade" visible>
        <Pressable style={styles.overlay} onPress={handleDismiss}>
          <Pressable style={styles.pwaCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.pwaHeader}>
              <View style={styles.pwaIconWrap}>
                <Icon name="download-outline" size={28} color={colors.primary} />
              </View>
              <Text style={styles.pwaTitle}>WayFable als App installieren</Text>
              <Text style={styles.pwaSubtitle}>
                Installiere WayFable auf deinem Startbildschirm — wie eine richtige App, direkt aus dem Browser.
              </Text>
            </View>

            <ScrollView style={styles.pwaBody} bounces={false}>
              {/* iOS */}
              <View style={[styles.pwaSection, isIos && styles.pwaSectionHighlight]}>
                <View style={styles.pwaSectionHeader}>
                  <Icon name="logo-apple" size={20} color={colors.text} />
                  <Text style={styles.pwaSectionTitle}>iPhone / iPad (Safari)</Text>
                </View>
                <View style={styles.pwaStep}>
                  <Text style={styles.pwaStepNum}>1</Text>
                  <Text style={styles.pwaStepText}>
                    Tippe auf das <Text style={styles.pwaBold}>Teilen-Symbol</Text> (Quadrat mit Pfeil nach oben) in der Safari-Leiste
                  </Text>
                </View>
                <View style={styles.pwaStep}>
                  <Text style={styles.pwaStepNum}>2</Text>
                  <Text style={styles.pwaStepText}>
                    Scrolle nach unten und tippe auf <Text style={styles.pwaBold}>{'"'}Zum Home-Bildschirm{'"'}</Text>
                  </Text>
                </View>
                <View style={styles.pwaStep}>
                  <Text style={styles.pwaStepNum}>3</Text>
                  <Text style={styles.pwaStepText}>
                    Tippe auf <Text style={styles.pwaBold}>{'"'}Hinzufügen{'"'}</Text> — fertig!
                  </Text>
                </View>
              </View>

              {/* Android */}
              <View style={[styles.pwaSection, isAndroid && styles.pwaSectionHighlight]}>
                <View style={styles.pwaSectionHeader}>
                  <Icon name="logo-android" size={20} color={colors.text} />
                  <Text style={styles.pwaSectionTitle}>Android (Chrome)</Text>
                </View>
                <View style={styles.pwaStep}>
                  <Text style={styles.pwaStepNum}>1</Text>
                  <Text style={styles.pwaStepText}>
                    Tippe auf das <Text style={styles.pwaBold}>Drei-Punkte-Menü</Text> (oben rechts in Chrome)
                  </Text>
                </View>
                <View style={styles.pwaStep}>
                  <Text style={styles.pwaStepNum}>2</Text>
                  <Text style={styles.pwaStepText}>
                    Wähle <Text style={styles.pwaBold}>{'"'}App installieren{'"'}</Text> oder <Text style={styles.pwaBold}>{'"'}Zum Startbildschirm hinzufügen{'"'}</Text>
                  </Text>
                </View>
                <View style={styles.pwaStep}>
                  <Text style={styles.pwaStepNum}>3</Text>
                  <Text style={styles.pwaStepText}>
                    Bestätige mit <Text style={styles.pwaBold}>{'"'}Installieren{'"'}</Text> — fertig!
                  </Text>
                </View>
              </View>

              <Text style={styles.pwaHint}>
                WayFable funktioniert dann wie eine native App — mit eigenem Icon, Vollbild und Offline-Unterstützung.
              </Text>
            </ScrollView>

            <TouchableOpacity style={styles.pwaDismissBtn} onPress={handleDismiss}>
              <Text style={styles.pwaDismissBtnText}>Verstanden</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  // Skip PWA announcement on non-web platforms
  if (isPwaAnnouncement) {
    // Auto-dismiss so next announcement can show
    handleDismiss();
    return null;
  }

  return (
    <Modal transparent animationType="fade" visible>
      <Pressable style={styles.overlay} onPress={handleDismiss}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <LinearGradient colors={[...gradients.sunset]} style={styles.gradient}>
            {announcement.image_url?.startsWith('icon:') ? (
              <View style={styles.icon}>
                <Icon name={(announcement.image_url.slice(5) || 'megaphone') as any} size={40} color="#FFFFFF" />
              </View>
            ) : announcement.image_url ? (
              <Image source={{ uri: announcement.image_url }} style={styles.image} resizeMode="contain" />
            ) : (
              <View style={styles.icon}>
                <Icon name="megaphone-outline" size={40} color="#FFFFFF" />
              </View>
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
    marginBottom: spacing.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
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

  // PWA Install Modal styles
  pwaCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    maxWidth: 480,
    width: Platform.OS === 'web' ? '90%' : '100%',
    maxHeight: '85%',
  },
  pwaHeader: {
    alignItems: 'center' as const,
    padding: spacing.xl,
    paddingBottom: spacing.md,
  },
  pwaIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary + '15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: spacing.md,
  },
  pwaTitle: {
    ...typography.h2,
    textAlign: 'center' as const,
    marginBottom: spacing.sm,
  },
  pwaSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 20,
  },
  pwaBody: {
    paddingHorizontal: spacing.xl,
  },
  pwaSection: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  pwaSectionHighlight: {
    borderWidth: 1.5,
    borderColor: colors.primary + '40',
    backgroundColor: colors.primary + '08',
  },
  pwaSectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  pwaSectionTitle: {
    ...typography.body,
    fontWeight: '600' as const,
  },
  pwaStep: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  pwaStepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
    lineHeight: 22,
    flexShrink: 0,
    overflow: 'hidden' as const,
  },
  pwaStepText: {
    ...typography.bodySmall,
    flex: 1,
    lineHeight: 20,
  },
  pwaBold: {
    fontWeight: '600' as const,
  },
  pwaHint: {
    ...typography.caption,
    color: colors.textLight,
    textAlign: 'center' as const,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  pwaDismissBtn: {
    paddingVertical: spacing.md,
    alignItems: 'center' as const,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    margin: spacing.sm,
  },
  pwaDismissBtnText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600' as const,
  },
});
