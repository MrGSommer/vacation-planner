import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../types/navigation';
import { colors, spacing, borderRadius, typography, shadows, gradients, iconSize } from '../../utils/theme';
import { Icon, IconName } from '../../utils/icons';
import { trackEvent } from '../../api/analytics';

interface FeatureHighlight {
  icon: IconName;
  text: string;
  detail?: string;
}

interface UpgradePromptProps {
  iconName?: IconName;
  title: string;
  message: string;
  inline?: boolean;
  /** Show "Inspirationen kaufen" instead of upgrade button */
  buyInspirations?: boolean;
  /** Feature highlights shown as animated benefit cards */
  highlights?: FeatureHighlight[];
  /** Gradient colors for the hero section */
  heroGradient?: readonly [string, string, ...string[]];
  /** Override CTA press — if not set, navigates to Subscription */
  onPress?: () => void;
  /** Secondary button label + handler (e.g. "Inspirationen kaufen") */
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  /** Analytics trigger name (e.g. "second_trip_attempt", "photo_limit_reached") */
  trigger?: string;
}

export const UpgradePrompt: React.FC<UpgradePromptProps> = ({
  iconName = 'lock-closed-outline',
  title,
  message,
  inline = false,
  buyInspirations = false,
  highlights,
  heroGradient,
  onPress: onPressOverride,
  secondaryLabel,
  onSecondaryPress,
  trigger,
}) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const isWide = width > 600;

  // Staggered animations for feature cards
  const fadeAnims = useRef(
    (highlights || []).map(() => new Animated.Value(0))
  ).current;
  const slideAnims = useRef(
    (highlights || []).map(() => new Animated.Value(20))
  ).current;
  const iconPulse = useRef(new Animated.Value(1)).current;
  const ctaScale = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    // Hero icon pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(iconPulse, { toValue: 1.1, duration: 1200, useNativeDriver: true }),
        Animated.timing(iconPulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();

    // CTA bounce in
    Animated.spring(ctaScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start();

    // Staggered card entrance
    const animations = fadeAnims.map((fade, i) =>
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 400, delay: 200 + i * 120, useNativeDriver: true }),
        Animated.timing(slideAnims[i], { toValue: 0, duration: 400, delay: 200 + i * 120, useNativeDriver: true }),
      ])
    );
    Animated.parallel(animations).start();
    trackEvent('paywall_shown', {
      trigger: trigger || (buyInspirations ? 'fable_without_credits' : 'generic'),
    });
  }, []);

  const handlePress = () => {
    trackEvent('checkout_started', {
      trigger: trigger || (buyInspirations ? 'fable_without_credits' : 'generic'),
    });
    if (onPressOverride) { onPressOverride(); return; }
    navigation.navigate('Subscription');
  };

  if (inline) {
    return (
      <TouchableOpacity
        style={styles.inlineCard}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={buyInspirations ? [...gradients.sunset] : [...gradients.ocean]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.inlineGradient}
        >
          <View style={styles.inlineIcon}>
            <Icon name={iconName} size={iconSize.md} color="#FFFFFF" />
          </View>
          <View style={styles.inlineInfo}>
            <Text style={styles.inlineTitle}>{title}</Text>
            <Text style={styles.inlineMessage}>{message}</Text>
          </View>
          <Icon name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  const gradient = heroGradient || (buyInspirations ? gradients.sunset : gradients.ocean);

  return (
    <ScrollView
      style={styles.fixedContainer}
      contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
      bounces={false}
    >
      <View style={[styles.innerContainer, isWide && { maxWidth: 520, alignSelf: 'center' as const, width: '100%' }]}>
        {/* Hero Section */}
        <LinearGradient
          colors={[...gradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, isWide && styles.heroWide]}
        >
          <Animated.View style={[styles.heroIconWrap, { transform: [{ scale: iconPulse }] }]}>
            <View style={[styles.heroIconCircle, isWide && styles.heroIconCircleWide]}>
              <Icon name={iconName} size={isWide ? 44 : 36} color="#FFFFFF" />
            </View>
          </Animated.View>
          <Text style={[styles.heroTitle, isWide && styles.heroTitleWide]}>{title}</Text>
          <Text style={[styles.heroMessage, isWide && styles.heroMessageWide]}>{message}</Text>
        </LinearGradient>

        {/* Feature Cards */}
        {highlights && highlights.length > 0 && (
          <View style={[styles.cardsContainer, isWide && styles.cardsContainerWide]}>
            {highlights.map((h, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.featureCard,
                  {
                    opacity: fadeAnims[i] || 1,
                    transform: [{ translateY: slideAnims[i] || 0 }],
                  },
                ]}
              >
                <View style={[styles.featureIconWrap, { backgroundColor: `${gradient[0]}18` }]}>
                  <Icon name={h.icon} size={20} color={gradient[0] as string} />
                </View>
                <View style={styles.featureTextWrap}>
                  <Text style={styles.featureTitle}>{h.text}</Text>
                  {h.detail && <Text style={styles.featureDetail}>{h.detail}</Text>}
                </View>
              </Animated.View>
            ))}
          </View>
        )}

        {/* CTA */}
        <Animated.View style={[styles.ctaWrap, { transform: [{ scale: ctaScale }] }]}>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={handlePress}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[...gradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGradient}
            >
              <Icon name="sparkles" size={18} color="#FFFFFF" />
              <Text style={styles.ctaText}>
                {buyInspirations ? 'Inspirationen kaufen' : 'Premium freischalten'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
          {!buyInspirations && <Text style={styles.ctaSubtext}>Ab CHF 9.90/Monat · Jederzeit kündbar</Text>}
          {secondaryLabel && onSecondaryPress && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onSecondaryPress}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryButtonText}>{secondaryLabel}</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  fixedContainer: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  scrollContentWide: { justifyContent: 'center' },

  innerContainer: {},

  // Hero
  hero: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  heroWide: {
    paddingVertical: spacing.xl,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  heroIconWrap: {
    marginBottom: spacing.sm,
  },
  heroIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIconCircleWide: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  heroTitle: {
    ...typography.h2,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 2,
    fontSize: 20,
  },
  heroTitleWide: {
    fontSize: 28,
  },
  heroMessage: {
    ...typography.body,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 20,
    fontSize: 13,
    maxWidth: 320,
  },
  heroMessageWide: {
    maxWidth: 420,
    fontSize: 16,
    lineHeight: 26,
  },

  // Feature Cards
  cardsContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  cardsContainerWide: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    ...shadows.sm,
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextWrap: {
    flex: 1,
  },
  featureTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  featureDetail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
    fontSize: 11,
  },

  // CTA
  ctaWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
    alignItems: 'center',
  },
  ctaButton: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 340,
    ...shadows.md,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  ctaText: {
    ...typography.button,
    color: '#FFFFFF',
    fontSize: 15,
  },
  ctaSubtext: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },

  secondaryButton: {
    marginTop: spacing.xs,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center' as const,
  },
  secondaryButtonText: {
    ...typography.body,
    fontWeight: '600' as const,
    color: colors.primary,
  },

  // Inline variant
  inlineCard: { borderRadius: borderRadius.lg, overflow: 'hidden', ...shadows.sm },
  inlineGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  inlineIcon: { marginRight: spacing.md, justifyContent: 'center' as const },
  inlineInfo: { flex: 1 },
  inlineTitle: { ...typography.body, fontWeight: '600', color: '#FFFFFF' },
  inlineMessage: { ...typography.caption, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
});
