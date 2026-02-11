import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Header } from '../../components/common';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useAuth } from '../../hooks/useAuth';
import { getSubscriptionUrl, getInspirationsUrl } from '../../api/stripe';
import { colors, spacing, borderRadius, typography, shadows, gradients } from '../../utils/theme';

type Props = { navigation: NativeStackNavigationProp<any> };

export const SubscriptionScreen: React.FC<Props> = ({ navigation }) => {
  const { isPremium, aiCredits } = useSubscription();
  const { user } = useAuth();
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('yearly');

  const handleSubscribe = () => {
    if (!user) return;
    if (Platform.OS === 'web') {
      window.location.href = getSubscriptionUrl(billing, user.id, user.email || '');
    }
  };

  if (isPremium) {
    return (
      <View style={styles.container}>
        <Header title="Abonnement" onBack={() => navigation.goBack()} />
        <View style={styles.activeContainer}>
          <Text style={styles.activeIcon}>{'✅'}</Text>
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
          <Text style={styles.heroSubtitle}>Entfessle das volle Potenzial deiner Reiseplanung</Text>
        </LinearGradient>

        {/* Features */}
        <View style={styles.features}>
          {[
            { icon: '✈️', title: 'Unbegrenzte Trips', desc: 'Plane so viele Reisen wie du willst' },
            { icon: '👥', title: 'Unbegrenzte Kollaborateure', desc: 'Teile mit dem ganzen Team' },
            { icon: '📸', title: 'Foto-Galerie', desc: 'Lade Reisefotos hoch und teile sie' },
            { icon: '🗺️', title: 'Routen & Stops', desc: 'Plane Reiserouten mit Zwischenstopps' },
            { icon: '✨', title: 'Reisebegleiter Fable', desc: '30 Inspirationen/Monat — dein persönlicher Reisebegleiter' },
          ].map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
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
            <Text style={styles.ctaText}>Jetzt upgraden</Text>
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
          </Text>
          <TouchableOpacity
            style={styles.inspirationButton}
            onPress={() => {
              if (!user) return;
              if (Platform.OS === 'web') {
                window.location.href = getInspirationsUrl(user.id, user.email || '');
              }
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.inspirationButtonText}>{'✨ Inspirationen kaufen'}</Text>
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
  features: { marginBottom: spacing.xl },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  featureIcon: { fontSize: 24, marginRight: spacing.md },
  featureInfo: { flex: 1 },
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
  activeIcon: { fontSize: 48, marginBottom: spacing.md },
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
  inspirationButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  inspirationButtonText: { ...typography.button, color: '#FFFFFF' },
});
