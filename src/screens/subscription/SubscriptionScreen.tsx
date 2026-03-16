import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Header } from '../../components/common';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useAuth } from '../../hooks/useAuth';
import { getSubscriptionUrl, getInspirationsUrl } from '../../api/stripe';
import { requireOnline } from '../../utils/offlineGate';
import { colors, spacing, borderRadius, typography, shadows, gradients } from '../../utils/theme';
import { Icon, IconName } from '../../utils/icons';

type Props = { navigation: NativeStackNavigationProp<any> };

const FEATURES: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'airplane-outline', title: 'Unbegrenzte Trips', desc: 'Plane so viele Reisen wie du willst' },
  { icon: 'people-outline', title: 'Unbegrenzte Kollaborateure', desc: 'Teile mit dem ganzen Team' },
  { icon: 'images-outline', title: 'Foto-Galerie', desc: 'Lade Reisefotos hoch und teile sie' },
  { icon: 'map-outline', title: 'Routen & Stops', desc: 'Plane Reiserouten mit Zwischenstopps' },
  { icon: 'wallet-outline', title: 'Budget & Ausgaben', desc: 'Tracke Kosten und teile fair auf' },
  { icon: 'sparkles-outline', title: 'Reisebegleiter Fable', desc: '20 Inspirationen/Monat — dein persönlicher Reisebegleiter' },
];

export const SubscriptionScreen: React.FC<Props> = ({ navigation }) => {
  const { isPremium, isTrialing, trialDaysLeft, aiCredits } = useSubscription();
  const { user } = useAuth();
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('yearly');

  const handleSubscribe = () => {
    if (!requireOnline('Zahlungen')) return;
    if (!user) return;
    if (Platform.OS === 'web') {
      window.location.href = getSubscriptionUrl(billing, user.id, user.email || '');
    }
  };

  // Active premium subscriber (not trialing)
  if (isPremium && !isTrialing) {
    return (
      <View style={styles.container}>
        <Header title="Abonnement" onBack={() => navigation.goBack()} />
        <View style={styles.activeContainer}>
          <Icon name="checkmark-circle" size={48} color={colors.secondary} />
          <Text style={styles.activeTitle}>Du bist Premium!</Text>
          <Text style={styles.activeMessage}>Du hast Zugriff auf alle Features</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Premium" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <LinearGradient
          colors={[...gradients.ocean]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroTitle}>WayFable Premium</Text>
          <Text style={styles.heroSubtitle}>
            {isTrialing
              ? `Dein Premium-Test endet in ${trialDaysLeft} ${trialDaysLeft === 1 ? 'Tag' : 'Tagen'}`
              : 'Entfessle das volle Potenzial deiner Reiseplanung'
            }
          </Text>
        </LinearGradient>

        {/* Trial countdown notice */}
        {isTrialing && (
          <View style={styles.trialNotice}>
            <Icon name="time-outline" size={20} color={trialDaysLeft <= 3 ? colors.error : colors.accent} />
            <Text style={styles.trialNoticeText}>
              {trialDaysLeft <= 3
                ? `Nur noch ${trialDaysLeft} ${trialDaysLeft === 1 ? 'Tag' : 'Tage'}! Sichere dir jetzt Premium.`
                : 'Abonniere jetzt, damit du nach dem Test keine Features verlierst.'
              }
            </Text>
          </View>
        )}

        {/* Features */}
        <View style={styles.features}>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <Icon name={f.icon} size={24} color={colors.secondary} />
              <View style={styles.featureInfo}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Billing Toggle */}
        <View style={styles.billingToggle}>
          <TouchableOpacity
            style={[styles.billingBtn, billing === 'monthly' && styles.billingBtnActive]}
            onPress={() => setBilling('monthly')}
          >
            <Text style={[styles.billingBtnText, billing === 'monthly' && styles.billingBtnTextActive]}>
              Monatlich
            </Text>
            <Text style={[styles.billingPrice, billing === 'monthly' && styles.billingPriceActive]}>
              CHF 9.90/Mt.
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.billingBtn, billing === 'yearly' && styles.billingBtnActive]}
            onPress={() => setBilling('yearly')}
          >
            <View style={styles.saveBadge}>
              <Text style={styles.saveBadgeText}>-17%</Text>
            </View>
            <Text style={[styles.billingBtnText, billing === 'yearly' && styles.billingBtnTextActive]}>
              Jährlich
            </Text>
            <Text style={[styles.billingPrice, billing === 'yearly' && styles.billingPriceActive]}>
              CHF 99/Jahr
            </Text>
          </TouchableOpacity>
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={handleSubscribe}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[...gradients.ocean]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradient}
          >
            <Text style={styles.ctaText}>
              {isTrialing ? 'Jetzt Premium sichern' : 'Jetzt upgraden'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.terms}>
          Jederzeit kündbar. Es gelten unsere AGB.
        </Text>

        {/* Inspirationen for everyone */}
        <View style={styles.inspirationSection}>
          <Text style={styles.inspirationTitle}>Oder: Inspirationen einzeln kaufen</Text>
          <Text style={styles.inspirationDesc}>
            Nutze Fable, deinen Reisebegleiter, auch ohne Abo.{'\n'}
            20 Inspirationen für CHF 5 — du hast aktuell {aiCredits}.
            {'\n'}
            <Text style={styles.inspirationKeepNote}>Gekaufte Inspirationen bleiben auch bei Kündigung erhalten.</Text>
          </Text>
          <TouchableOpacity
            style={styles.inspirationButton}
            onPress={() => {
              if (!requireOnline('Zahlungen')) return;
              if (!user) return;
              if (Platform.OS === 'web') {
                window.location.href = getInspirationsUrl(user.id, user.email || '');
              }
            }}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="sparkles-outline" size={16} color="#FFFFFF" /><Text style={styles.inspirationButtonText}>Inspirationen kaufen</Text></View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
  hero: {
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  heroTitle: { ...typography.h1, color: '#FFFFFF', marginBottom: spacing.sm },
  heroSubtitle: { ...typography.body, color: 'rgba(255,255,255,0.9)', textAlign: 'center' },
  trialNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent + '15',
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  trialNoticeText: { ...typography.bodySmall, color: colors.text, flex: 1, lineHeight: 20 },
  features: { marginBottom: spacing.xl },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  featureInfo: { flex: 1, marginLeft: spacing.md },
  featureTitle: { ...typography.body, fontWeight: '600' },
  featureDesc: { ...typography.caption, color: colors.textSecondary },
  billingToggle: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  billingBtn: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  billingBtnActive: {
    borderColor: colors.secondary,
    backgroundColor: colors.secondary + '10',
  },
  billingBtnText: { ...typography.body, fontWeight: '600', marginBottom: spacing.xs },
  billingBtnTextActive: { color: colors.secondary },
  billingPrice: { ...typography.h3, color: colors.textSecondary },
  billingPriceActive: { color: colors.secondary },
  saveBadge: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  saveBadgeText: { ...typography.caption, color: '#FFFFFF', fontWeight: '700', fontSize: 10 },
  ctaButton: { borderRadius: borderRadius.lg, overflow: 'hidden', ...shadows.md },
  ctaGradient: {
    padding: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.lg,
  },
  ctaText: { ...typography.button, color: '#FFFFFF', fontSize: 18 },
  terms: { ...typography.caption, color: colors.textLight, textAlign: 'center', marginTop: spacing.md },
  activeContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  activeTitle: { ...typography.h2, marginBottom: spacing.sm },
  activeMessage: { ...typography.body, color: colors.textSecondary },
  inspirationSection: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    ...shadows.sm,
  },
  inspirationTitle: { ...typography.h3, marginBottom: spacing.sm, textAlign: 'center' },
  inspirationDesc: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md, lineHeight: 22 },
  inspirationKeepNote: { fontStyle: 'italic', color: colors.textLight },
  inspirationButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  inspirationButtonText: { ...typography.button, color: '#FFFFFF' },
});
