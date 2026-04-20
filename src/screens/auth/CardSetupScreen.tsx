import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../api/supabase';
import { colors, spacing, borderRadius, typography, shadows, gradients } from '../../utils/theme';
import { Icon, IconName } from '../../utils/icons';
import { STRIPE_CONFIG } from '../../config/stripe';
import { logError } from '../../services/errorLogger';

type Props = { navigation: NativeStackNavigationProp<any> };

const BENEFITS: { icon: IconName; text: string }[] = [
  { icon: 'shield-checkmark-outline', text: 'Wir belasten deine Karte nicht' },
  { icon: 'time-outline', text: '14 Tage kostenlos alle Features testen' },
  { icon: 'close-circle-outline', text: 'Jederzeit kündbar — kein Abo-Zwang' },
];

export const CardSetupScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Card setup is web-only (Stripe Elements require DOM)
  if (Platform.OS !== 'web') {
    return (
      <View style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
          <Text style={styles.heroTitle}>Karteneinrichtung nur im Browser verfügbar</Text>
          <TouchableOpacity style={styles.skipButton} onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })}>
            <Text style={styles.skipText}>Weiter</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const handleSetupCard = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Nicht angemeldet');

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/setup-card`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!res.ok) throw new Error('Karteneinrichtung fehlgeschlagen');

      const { clientSecret: cs } = await res.json();
      setClientSecret(cs);

      // On web, use Stripe.js via script tag
      if (Platform.OS === 'web') {
        await loadStripeAndMount(cs);
      }
    } catch (e: any) {
      logError(e, { severity: 'critical', component: 'CardSetupScreen', context: { action: 'handleSetupCard' } });
      setError(e?.message || 'Ein Fehler ist aufgetreten');
    } finally {
      setLoading(false);
    }
  };

  const loadStripeAndMount = async (cs: string) => {
    // Dynamically load Stripe.js if not already loaded
    if (!(window as any).Stripe) {
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.async = true;
      await new Promise<void>((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Stripe.js konnte nicht geladen werden'));
        document.head.appendChild(script);
      });
    }

    const stripe = (window as any).Stripe(STRIPE_CONFIG.publishableKey);
    const elements = stripe.elements({ clientSecret: cs, locale: 'de' });

    // Mount the Payment Element
    const paymentElement = elements.create('payment', {
      layout: 'tabs',
    });

    // Wait for container to be in DOM
    setTimeout(() => {
      const container = document.getElementById('stripe-payment-element');
      if (container) {
        paymentElement.mount(container);
      }
    }, 100);

    // Store for form submission
    (window as any).__wayfable_stripe = stripe;
    (window as any).__wayfable_elements = elements;
  };

  const handleConfirmSetup = async () => {
    if (!clientSecret || Platform.OS !== 'web') return;
    setLoading(true);
    setError(null);

    try {
      const stripe = (window as any).__wayfable_stripe;
      const elements = (window as any).__wayfable_elements;

      if (!stripe || !elements) throw new Error('Stripe nicht initialisiert');

      const { error: stripeError } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/subscription-success`,
        },
        redirect: 'if_required',
      });

      if (stripeError) {
        setError(stripeError.message || 'Kartenverifizierung fehlgeschlagen');
      } else {
        // Success! Navigate to main app
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      }
    } catch (e: any) {
      logError(e, { severity: 'critical', component: 'CardSetupScreen', context: { action: 'handleConfirmSetup' } });
      setError(e?.message || 'Ein Fehler ist aufgetreten');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    // Skip card setup → user stays on free tier (trial won't activate without card)
    setLoading(true);
    try {
      if (user) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            subscription_tier: 'free',
            subscription_status: 'canceled',
            subscription_period_end: null,
            ai_credits_balance: 0,
          })
          .eq('id', user.id);

        if (updateError) {
          console.error('Skip card setup: profile update failed', updateError);
          // Continue to main anyway — trial-expiry cron will handle downgrade later
        }
      }
    } catch (e) {
      logError(e, { severity: 'critical', component: 'CardSetupScreen', context: { action: 'handleSkip' } });
      console.error('Skip card setup error:', e);
    } finally {
      setLoading(false);
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[...gradients.ocean]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroSection}
      >
        <Icon name="card-outline" size={48} color="#FFFFFF" />
        <Text style={styles.heroTitle}>14 Tage Premium — kostenlos</Text>
        <Text style={styles.heroSubtitle}>
          Hinterlege deine Karte und teste alle Features 14 Tage lang gratis.
        </Text>
      </LinearGradient>

      <View style={styles.content}>
        {/* Benefits */}
        <View style={styles.benefits}>
          {BENEFITS.map((b, i) => (
            <View key={i} style={styles.benefitRow}>
              <Icon name={b.icon} size={22} color={colors.secondary} />
              <Text style={styles.benefitText}>{b.text}</Text>
            </View>
          ))}
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Stripe Payment Element container (web only) */}
        {clientSecret && Platform.OS === 'web' && (
          <View style={styles.stripeContainer}>
            {/* Raw div is safe here — guarded by Platform.OS === 'web' check */}
            {Platform.OS === 'web' && <div id="stripe-payment-element" style={{ minHeight: 100 }} />}
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleConfirmSetup}
              disabled={loading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[...gradients.ocean]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.confirmGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmText}>Karte hinterlegen</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* Initial setup button (before Stripe elements load) */}
        {!clientSecret && (
          <TouchableOpacity
            style={styles.setupButton}
            onPress={handleSetupCard}
            disabled={loading}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[...gradients.ocean]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.setupGradient}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Icon name="card-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.setupText}>Karte hinterlegen & Premium testen</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>Überspringen — Free-Version nutzen</Text>
        </TouchableOpacity>

        <Text style={styles.legal}>
          Deine Karte wird sicher bei Stripe gespeichert. Es wird kein Betrag abgebucht.
          Nach 14 Tagen wechselst du automatisch zum Free-Tier — ohne Kosten.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  heroSection: {
    padding: spacing.xl,
    paddingTop: spacing.xxl + spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroTitle: { ...typography.h1, color: '#FFFFFF', textAlign: 'center' },
  heroSubtitle: { ...typography.body, color: 'rgba(255,255,255,0.9)', textAlign: 'center', lineHeight: 24 },
  content: { flex: 1, padding: spacing.xl },
  benefits: { marginBottom: spacing.xl, gap: spacing.md },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  benefitText: { ...typography.body, color: colors.text, flex: 1 },
  errorBox: { backgroundColor: '#FFEAEA', padding: spacing.md, borderRadius: borderRadius.md, marginBottom: spacing.md },
  errorText: { ...typography.bodySmall, color: colors.error },
  stripeContainer: { marginBottom: spacing.md },
  setupButton: { borderRadius: borderRadius.lg, overflow: 'hidden', ...shadows.md, marginBottom: spacing.md },
  setupGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md + 2,
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  setupText: { ...typography.button, color: '#FFFFFF', fontSize: 16 },
  confirmButton: { borderRadius: borderRadius.lg, overflow: 'hidden', ...shadows.md, marginTop: spacing.md },
  confirmGradient: {
    padding: spacing.md + 2,
    alignItems: 'center',
    borderRadius: borderRadius.lg,
  },
  confirmText: { ...typography.button, color: '#FFFFFF', fontSize: 16 },
  skipButton: { alignItems: 'center', paddingVertical: spacing.md },
  skipText: { ...typography.body, color: colors.textSecondary, fontWeight: '500' },
  legal: {
    ...typography.caption,
    color: colors.textLight,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: spacing.lg,
  },
});
