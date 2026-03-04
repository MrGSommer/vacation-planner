import React, { useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, useWindowDimensions } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/common';
import { colors, spacing, borderRadius, typography, shadows, gradients, iconSize } from '../../utils/theme';
import { Icon, IconName } from '../../utils/icons';

type Props = { navigation: NativeStackNavigationProp<any> };

const NAV_ITEMS = [
  { label: 'Features', id: 'features' },
  { label: 'Preise', id: 'pricing' },
  { label: 'FAQ', id: 'faq' },
];

export const WelcomeScreen: React.FC<Props> = ({ navigation }) => {
  const scrollRef = useRef<ScrollView>(null);
  const sectionRefs = useRef<Record<string, number>>({});
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width > 700;

  const scrollTo = (id: string) => {
    const y = sectionRefs.current[id];
    if (y !== undefined) {
      scrollRef.current?.scrollTo({ y, animated: true });
    }
  };

  return (
    <View style={styles.container}>
      {/* Sticky Nav */}
      <View style={[styles.nav, { paddingTop: insets.top + spacing.xs, paddingHorizontal: isWide ? spacing.xl : spacing.md }]}>
        <Text style={styles.navLogo}>WayFable</Text>
        <View style={[styles.navLinks, { gap: isWide ? spacing.lg : spacing.sm }]}>
          {isWide && NAV_ITEMS.map(item => (
            <TouchableOpacity key={item.id} onPress={() => scrollTo(item.id)}>
              <Text style={styles.navLink}>{item.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.navCta} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.navCtaText}>Anmelden</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView ref={scrollRef} style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <LinearGradient
          colors={['#4ECDC4', '#74B9FF', '#6C5CE7']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Icon name="airplane" size={64} color="#FFFFFF" />
          <Text style={styles.heroTitle}>Deine Reisen.{'\n'}Dein Weg.</Text>
          <Text style={styles.heroSubtitle}>
            Plane Traumreisen gemeinsam mit Freunden — Routen, Budgets, Unterkünfte und mehr. Alles an einem Ort.
          </Text>
          <View style={styles.heroCtas}>
            <TouchableOpacity
              style={styles.heroBtn}
              onPress={() => navigation.navigate('SignUp')}
              activeOpacity={0.8}
            >
              <Text style={styles.heroBtnText}>Kostenlos starten</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => scrollTo('features')}>
              <Text style={styles.heroLearnMore}>Mehr erfahren ↓</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Features */}
        <View
          style={styles.section}
          onLayout={(e) => { sectionRefs.current['features'] = e.nativeEvent.layout.y; }}
        >
          <Text style={styles.sectionTitle}>Alles was du brauchst</Text>
          <Text style={styles.sectionSubtitle}>Von der Idee bis zur Erinnerung — WayFable begleitet dich durch jede Phase deiner Reise</Text>

          <View style={styles.featureGrid}>
            {([
              { icon: 'calendar-outline' as IconName, title: 'Tagesplaner', desc: 'Plane jeden Tag mit Aktivitäten, Zeiten und Orten' },
              { icon: 'map-outline' as IconName, title: 'Routen & Stops', desc: 'Visualisiere deine Route mit Übernachtungen und Zwischenstopps' },
              { icon: 'wallet-outline' as IconName, title: 'Budget-Tracker', desc: 'Behalte Ausgaben im Blick mit Kategorien und Charts' },
              { icon: 'people-outline' as IconName, title: 'Team-Planung', desc: 'Lade Freunde ein und plant gemeinsam in Echtzeit' },
              { icon: 'images-outline' as IconName, title: 'Foto-Galerie', desc: 'Halte Erinnerungen fest und teile sie mit der Gruppe' },
              { icon: 'sparkles-outline' as IconName, title: 'Reisebegleiter Fable', desc: 'Dein persönlicher Begleiter plant die perfekte Reise für dich' },
            ]).map((f, i) => (
              <View key={i} style={[styles.featureCard, { width: isWide ? '30%' : '100%' }]}>
                <Icon name={f.icon} size={iconSize.lg} color={colors.primary} />
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* How it Works */}
        <View style={styles.sectionAlt}>
          <Text style={styles.sectionTitle}>So funktioniert's</Text>
          <View style={[styles.stepsRow, { flexDirection: isWide ? 'row' : 'column', alignItems: isWide ? 'flex-start' : 'center' }]}>
            {[
              { step: '1', title: 'Trip erstellen', desc: 'Wähle Ziel, Daten und lade dein Team ein' },
              { step: '2', title: 'Gemeinsam planen', desc: 'Füllt den Tagesplan, Budget und Packliste aus' },
              { step: '3', title: 'Losreisen', desc: 'Nutze die App als Reisebegleiter unterwegs' },
            ].map((s, i) => (
              <View key={i} style={[styles.stepCard, isWide && { flex: 1 }]}>
                <LinearGradient
                  colors={[...gradients.ocean]}
                  style={styles.stepNumber}
                >
                  <Text style={styles.stepNumberText}>{s.step}</Text>
                </LinearGradient>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepDesc}>{s.desc}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Pricing */}
        <View
          style={styles.section}
          onLayout={(e) => { sectionRefs.current['pricing'] = e.nativeEvent.layout.y; }}
        >
          <Text style={styles.sectionTitle}>Einfache Preise</Text>
          <Text style={styles.sectionSubtitle}>Starte kostenlos, upgrade wenn du bereit bist</Text>

          <View style={[styles.pricingRow, { flexDirection: isWide ? 'row' : 'column', alignItems: isWide ? 'stretch' : 'center' }]}>
            <View style={[styles.pricingCard, { width: isWide ? '40%' : '100%' }]}>
              <Text style={styles.pricingTier}>Free</Text>
              <Text style={styles.pricingPrice}>CHF 0</Text>
              <Text style={styles.pricingPeriod}>für immer</Text>
              <View style={styles.pricingFeatures}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs }}><Icon name="checkmark" size={14} color={colors.secondary} /><Text style={styles.pricingFeature}>2 aktive Trips</Text></View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs }}><Icon name="checkmark" size={14} color={colors.secondary} /><Text style={styles.pricingFeature}>2 Kollaborateure</Text></View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs }}><Icon name="checkmark" size={14} color={colors.secondary} /><Text style={styles.pricingFeature}>Tagesplan & Budget</Text></View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs }}><Icon name="checkmark" size={14} color={colors.secondary} /><Text style={styles.pricingFeature}>Packliste</Text></View>
              </View>
              <Button
                title="Kostenlos starten"
                variant="secondary"
                onPress={() => navigation.navigate('SignUp')}
              />
            </View>

            <View style={[styles.pricingCard, styles.pricingCardPremium, { width: isWide ? '40%' : '100%' }]}>
              <LinearGradient
                colors={[...gradients.ocean]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.pricingBadge}
              >
                <Text style={styles.pricingBadgeText}>Beliebt</Text>
              </LinearGradient>
              <Text style={styles.pricingTier}>Premium</Text>
              <Text style={styles.pricingPrice}>CHF 9.90</Text>
              <Text style={styles.pricingPeriod}>pro Monat</Text>
              <Text style={styles.pricingYearly}>oder CHF 99/Jahr (-17%)</Text>
              <View style={styles.pricingFeatures}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs }}><Icon name="checkmark" size={14} color={colors.secondary} /><Text style={styles.pricingFeature}>Unbegrenzte Trips</Text></View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs }}><Icon name="checkmark" size={14} color={colors.secondary} /><Text style={styles.pricingFeature}>Unbegrenzte Kollaborateure</Text></View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs }}><Icon name="checkmark" size={14} color={colors.secondary} /><Text style={styles.pricingFeature}>Foto-Galerie</Text></View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs }}><Icon name="checkmark" size={14} color={colors.secondary} /><Text style={styles.pricingFeature}>Routen & Stops</Text></View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs }}><Icon name="checkmark" size={14} color={colors.secondary} /><Text style={styles.pricingFeature}>Reisebegleiter Fable</Text></View>
              </View>
              <Button
                title="Premium starten"
                onPress={() => navigation.navigate('SignUp')}
              />
            </View>
          </View>
        </View>

        {/* FAQ */}
        <View
          style={styles.sectionAlt}
          onLayout={(e) => { sectionRefs.current['faq'] = e.nativeEvent.layout.y; }}
        >
          <Text style={styles.sectionTitle}>Häufige Fragen</Text>
          {[
            { q: 'Kann ich WayFable kostenlos nutzen?', a: 'Ja! Der Free-Plan ist dauerhaft kostenlos. Du kannst bis zu 2 Trips planen und mit 2 Personen zusammenarbeiten.' },
            { q: 'Wie funktioniert Fable?', a: 'Fable ist dein persönlicher Reisebegleiter. Er stellt dir einige Fragen zu deinen Vorlieben und erstellt dann einen kompletten Reiseplan mit Aktivitäten, Unterkünften und Budget. Du kannst Inspirationen auch einzeln kaufen — ganz ohne Abo.' },
            { q: 'Kann ich mein Abo jederzeit kündigen?', a: 'Ja, du kannst jederzeit kündigen. Dein Premium-Zugang bleibt bis zum Ende der Abrechnungsperiode aktiv.' },
            { q: 'Welche Zahlungsmethoden gibt es?', a: 'Wir nutzen Stripe für sichere Zahlungen. Du kannst mit Kreditkarte, Debitkarte und weiteren lokalen Methoden bezahlen.' },
            { q: 'Werden meine Daten sicher gespeichert?', a: 'Ja, alle Daten werden verschlüsselt übertragen und auf EU-Servern gespeichert. Wir halten uns an das Schweizer Datenschutzgesetz (nDSG) und die DSGVO.' },
          ].map((faq, i) => (
            <View key={i} style={styles.faqCard}>
              <Text style={styles.faqQ}>{faq.q}</Text>
              <Text style={styles.faqA}>{faq.a}</Text>
            </View>
          ))}
        </View>

        {/* Final CTA */}
        <LinearGradient
          colors={['#FF6B6B', '#FF8B94', '#FFD93D']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.finalCta}
        >
          <Text style={styles.finalCtaTitle}>Bereit für dein nächstes Abenteuer?</Text>
          <Text style={styles.finalCtaSubtitle}>Erstelle deinen ersten Trip in unter 2 Minuten</Text>
          <TouchableOpacity
            style={styles.finalCtaBtn}
            onPress={() => navigation.navigate('SignUp')}
            activeOpacity={0.8}
          >
            <Text style={styles.finalCtaBtnText}>Jetzt kostenlos starten</Text>
          </TouchableOpacity>
        </LinearGradient>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerLogo}>WayFable</Text>
          <Text style={styles.footerCopy}>{'© 2026 Gabriel Sommer. Alle Rechte vorbehalten.'}</Text>
          <View style={styles.footerLinks}>
            <TouchableOpacity onPress={() => navigation.navigate('Datenschutz' as any)}>
              <Text style={styles.footerLink}>Datenschutz</Text>
            </TouchableOpacity>
            <Text style={styles.footerDot}>{'·'}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('AGB' as any)}>
              <Text style={styles.footerLink}>AGB</Text>
            </TouchableOpacity>
            <Text style={styles.footerDot}>{'·'}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Impressum' as any)}>
              <Text style={styles.footerLink}>Impressum</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },

  // Nav
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 10,
  },
  navLogo: { fontSize: 22, fontWeight: '800', color: colors.secondary },
  navLinks: { flexDirection: 'row', alignItems: 'center' },
  navLink: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  navCta: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full },
  navCtaText: { ...typography.bodySmall, fontWeight: '600', color: '#FFFFFF' },

  // Hero
  hero: {
    padding: spacing.xl,
    paddingVertical: spacing.xxl * 1.5,
    alignItems: 'center',
  },
  heroEmoji: { fontSize: 64, marginBottom: spacing.lg },
  heroTitle: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: spacing.md,
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroSubtitle: {
    ...typography.body,
    fontSize: 18,
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
    maxWidth: 500,
    lineHeight: 28,
  },
  heroCtas: { alignItems: 'center', marginTop: spacing.xl },
  heroBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    ...shadows.md,
  },
  heroBtnText: { ...typography.button, color: colors.secondary, fontSize: 18 },
  heroLearnMore: { ...typography.body, color: 'rgba(255,255,255,0.8)', marginTop: spacing.lg },

  // Sections
  section: { padding: spacing.xl, paddingVertical: spacing.xxl },
  sectionAlt: { padding: spacing.xl, paddingVertical: spacing.xxl, backgroundColor: colors.card },
  sectionTitle: { ...typography.h1, textAlign: 'center', marginBottom: spacing.sm },
  sectionSubtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl, maxWidth: 480, alignSelf: 'center' },

  // Features Grid
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
  },
  featureCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.sm,
  },
  featureIcon: { fontSize: 32, marginBottom: spacing.sm },
  featureTitle: { ...typography.h3, marginBottom: spacing.xs },
  featureDesc: { ...typography.bodySmall, color: colors.textSecondary },

  // Steps
  stepsRow: {
    gap: spacing.lg,
    justifyContent: 'center',
  },
  stepCard: { alignItems: 'center', maxWidth: 280 },
  stepNumber: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  stepNumberText: { ...typography.h2, color: '#FFFFFF' },
  stepTitle: { ...typography.h3, textAlign: 'center', marginBottom: spacing.xs },
  stepDesc: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },

  // Pricing
  pricingRow: {
    gap: spacing.lg,
    justifyContent: 'center',
  },
  pricingCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    maxWidth: 380,
    borderWidth: 2,
    borderColor: colors.border,
    ...shadows.sm,
  },
  pricingCardPremium: {
    borderColor: colors.secondary,
    position: 'relative',
  },
  pricingBadge: {
    position: 'absolute',
    top: -12,
    right: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  pricingBadgeText: { ...typography.caption, color: '#FFFFFF', fontWeight: '700' },
  pricingTier: { ...typography.h3, marginBottom: spacing.sm },
  pricingPrice: { fontSize: 36, fontWeight: '800', color: colors.text },
  pricingPeriod: { ...typography.bodySmall, color: colors.textLight, marginBottom: spacing.sm },
  pricingYearly: { ...typography.caption, color: colors.secondary, fontWeight: '600', marginBottom: spacing.md },
  pricingFeatures: { marginBottom: spacing.lg },
  pricingFeature: { ...typography.body, marginBottom: spacing.xs },

  // FAQ
  faqCard: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  faqQ: { ...typography.body, fontWeight: '600', marginBottom: spacing.xs },
  faqA: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 22 },

  // Final CTA
  finalCta: {
    padding: spacing.xl,
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  finalCtaTitle: { ...typography.h1, color: '#FFFFFF', textAlign: 'center', marginBottom: spacing.sm },
  finalCtaSubtitle: { ...typography.body, color: 'rgba(255,255,255,0.9)', textAlign: 'center', marginBottom: spacing.xl },
  finalCtaBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    ...shadows.md,
  },
  finalCtaBtnText: { ...typography.button, color: colors.primary, fontSize: 18 },

  // Footer
  footer: {
    padding: spacing.xl,
    alignItems: 'center',
    backgroundColor: colors.text,
  },
  footerLogo: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', marginBottom: spacing.sm },
  footerCopy: { ...typography.caption, color: 'rgba(255,255,255,0.5)', marginBottom: spacing.md },
  footerLinks: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  footerLink: { ...typography.bodySmall, color: 'rgba(255,255,255,0.7)' },
  footerDot: { color: 'rgba(255,255,255,0.3)' },
});
