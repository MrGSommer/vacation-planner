import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
  useWindowDimensions, Animated, Easing, NativeScrollEvent, NativeSyntheticEvent,
  Linking,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/common';
import { colors, spacing, borderRadius, typography, shadows, gradients } from '../../utils/theme';
import { Icon, IconName } from '../../utils/icons';

type Props = { navigation: NativeStackNavigationProp<any> };

/** Stable component for animated count-up numbers — must be outside render to avoid remounts */
const CountText = React.memo(({ value, suffix, style }: { value: Animated.Value; suffix: string; style: any }) => {
  const format = (v: number) => Math.round(v).toLocaleString('de-CH');
  // Read current value on mount (animation may have already completed)
  const [display, setDisplay] = useState(() => format((value as any).__getValue?.() ?? (value as any)._value ?? 0));
  useEffect(() => {
    const id = value.addListener(({ value: v }) => setDisplay(format(v)));
    return () => value.removeListener(id);
  }, [value]);
  return <Text style={style}>{display}{suffix}</Text>;
});

const MAX_WIDTH = 1200;
const UTM = '?utm_source=wayfable&utm_medium=referral';
const UNSPLASH_URL = `https://unsplash.com/${UTM}`;

const NAV_ITEMS = [
  { label: 'Features', id: 'features' },
  { label: 'Preise', id: 'pricing' },
  { label: 'FAQ', id: 'faq' },
];

// Attribution: name|profileUrl|photoUrl (same format as trip headers)
const HERO_IMAGE = 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1600&q=80';
const HERO_ATTR = { name: 'Dino Reichmuth', profile: 'https://unsplash.com/@dinoreichmuth' };
const CTA_IMAGE = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&q=80';
const CTA_ATTR = { name: 'Sean Oulashin', profile: 'https://unsplash.com/@oulashin' };

type FeatureItem = {
  icon: IconName; title: string; desc: string; image: string;
  attr: { name: string; profile: string };
};

const FEATURES: FeatureItem[] = [
  {
    icon: 'calendar-outline',
    title: 'Plane jeden Tag bis ins Detail',
    desc: 'Erstelle Tagesprogramme mit Aktivitäten, Uhrzeiten und Orten. Behalte den Überblick über jeden einzelnen Reisetag.',
    image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80',
    attr: { name: 'Pietro De Grandi', profile: 'https://unsplash.com/@peter_mc_greats' },
  },
  {
    icon: 'people-outline',
    title: 'Plant gemeinsam in Echtzeit',
    desc: 'Lade Freunde und Familie ein — alle sehen Änderungen sofort. Gemeinsam planen war noch nie so einfach.',
    image: 'https://images.unsplash.com/photo-1539635278303-d4002c07eae3?w=800&q=80',
    attr: { name: 'Felix Rostig', profile: 'https://unsplash.com/@felixrstg' },
  },
  {
    icon: 'wallet-outline',
    title: 'Behalte Ausgaben im Blick',
    desc: 'Kategorien, Belege, Charts und faire Aufteilung. Damit am Ende keine bösen Überraschungen warten.',
    image: 'https://images.unsplash.com/photo-1707157284454-553ef0a4ed0d?w=800&q=80',
    attr: { name: 'Jakub Żerdzicki', profile: 'https://unsplash.com/@jakubzerdzicki' },
  },
  {
    icon: 'sparkles-outline',
    title: 'Dein persönlicher Reisebegleiter',
    desc: 'Fable kennt deine Vorlieben und erstellt massgeschneiderte Reisepläne. Von der Inspiration bis zum fertigen Tagesplan.',
    image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80',
    attr: { name: 'Annie Spratt', profile: 'https://unsplash.com/@anniespratt' },
  },
  {
    icon: 'images-outline',
    title: 'Halte Erinnerungen fest',
    desc: 'Lade Fotos hoch, teile sie mit der Gruppe und organisiere sie nach Tag oder Ort. Deine Reise in Bildern.',
    image: 'https://images.unsplash.com/photo-1459213599465-03ab6a4d5931?w=800&q=80',
    attr: { name: 'Marcelo Quinan', profile: 'https://unsplash.com/@marceloquinan' },
  },
  {
    icon: 'map-outline',
    title: 'Visualisiere deine Route',
    desc: 'Übernachtungen, Stops und Wegpunkte auf der Karte. Plane deine Strecke visuell und behalte den Überblick.',
    image: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=80',
    attr: { name: 'Luca Bravo', profile: 'https://unsplash.com/@lucabravo' },
  },
];

const STEPS = [
  { step: '1', title: 'Trip erstellen', desc: 'Wähle Ziel, Daten und lade dein Team ein' },
  { step: '2', title: 'Gemeinsam planen', desc: 'Füllt den Tagesplan, Budget und Packliste aus' },
  { step: '3', title: 'Losreisen', desc: 'Nutze die App als Reisebegleiter unterwegs' },
];

const FAQS = [
  { q: 'Kann ich WayFable kostenlos nutzen?', a: 'Ja! Der Free-Plan ist dauerhaft kostenlos. Du kannst bis zu 2 Trips planen und mit 2 Personen zusammenarbeiten.' },
  { q: 'Wie funktioniert Fable?', a: 'Fable ist dein persönlicher Reisebegleiter. Er stellt dir einige Fragen zu deinen Vorlieben und erstellt dann einen kompletten Reiseplan mit Aktivitäten, Unterkünften und Budget. Du kannst Inspirationen auch einzeln kaufen — ganz ohne Abo.' },
  { q: 'Kann ich mein Abo jederzeit kündigen?', a: 'Ja, du kannst jederzeit kündigen. Dein Premium-Zugang bleibt bis zum Ende der Abrechnungsperiode aktiv.' },
  { q: 'Welche Zahlungsmethoden gibt es?', a: 'Wir nutzen Stripe für sichere Zahlungen. Du kannst mit Kreditkarte, Debitkarte und weiteren lokalen Methoden bezahlen.' },
  { q: 'Werden meine Daten sicher gespeichert?', a: 'Ja, alle Daten werden verschlüsselt übertragen und auf EU-Servern gespeichert. Wir halten uns an das Schweizer Datenschutzgesetz (nDSG) und die DSGVO.' },
];

const FREE_FEATURES = [
  '2 aktive Trips',
  '2 Kollaborateure',
  'Tagesplan & Budget',
  'Packliste',
];

const PREMIUM_FEATURES = [
  'Unbegrenzte Trips',
  'Unbegrenzte Kollaborateure',
  'Foto-Galerie',
  'Routen & Stops',
  'Reisebegleiter Fable',
];

// --- Animated section hook ---
function useAnimatedSection() {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(30)).current;
  const triggered = useRef(false);
  const layoutY = useRef(0);

  const onLayout = (e: { nativeEvent: { layout: { y: number } } }) => {
    layoutY.current = e.nativeEvent.layout.y;
  };

  const check = (scrollY: number, viewportH: number) => {
    if (triggered.current) return;
    if (scrollY + viewportH * 0.85 > layoutY.current) {
      triggered.current = true;
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
        Animated.timing(translateY, { toValue: 0, duration: 600, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
      ]).start();
    }
  };

  return { opacity, translateY, onLayout, check, layoutY };
}

export const WelcomeScreen: React.FC<Props> = ({ navigation }) => {
  const scrollRef = useRef<ScrollView>(null);
  const sectionRefs = useRef<Record<string, number>>({});
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const isMobile = width <= 700;
  const isTablet = width > 700 && width <= 1024;
  const isDesktop = width > 1024;

  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const faqHeights = useRef(FAQS.map(() => new Animated.Value(0))).current;
  const faqChevrons = useRef(FAQS.map(() => new Animated.Value(0))).current;

  // Hero staggered animations
  const heroBadgeOpacity = useRef(new Animated.Value(0)).current;
  const heroTitleOpacity = useRef(new Animated.Value(0)).current;
  const heroTitleTranslateY = useRef(new Animated.Value(30)).current;
  const heroSubOpacity = useRef(new Animated.Value(0)).current;
  const heroSubTranslateY = useRef(new Animated.Value(30)).current;
  const heroCtaOpacity = useRef(new Animated.Value(0)).current;
  const heroCtaTranslateY = useRef(new Animated.Value(30)).current;

  // Parallax
  const scrollY = useRef(new Animated.Value(0)).current;

  // Scroll-triggered section animations
  const socialProofAnim = useAnimatedSection();
  const featureAnims = FEATURES.map(() => useAnimatedSection());
  const stepsAnim = useAnimatedSection();
  const pricingAnim = useAnimatedSection();
  const faqAnim = useAnimatedSection();
  const ctaAnim = useAnimatedSection();

  // Count-up animations for social proof
  const countTrips = useRef(new Animated.Value(0)).current;
  const countActivities = useRef(new Animated.Value(0)).current;
  const countSatisfied = useRef(new Animated.Value(0)).current;
  const countsStarted = useRef(false);

  useEffect(() => {
    // Hero staggered entrance
    const delays = [
      { opacity: heroBadgeOpacity, delay: 100 },
      { opacity: heroTitleOpacity, translateY: heroTitleTranslateY, delay: 200 },
      { opacity: heroSubOpacity, translateY: heroSubTranslateY, delay: 400 },
      { opacity: heroCtaOpacity, translateY: heroCtaTranslateY, delay: 600 },
    ];
    delays.forEach(({ opacity, translateY: ty, delay }) => {
      setTimeout(() => {
        const anims = [Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: false, easing: Easing.out(Easing.cubic) })];
        if (ty) anims.push(Animated.timing(ty, { toValue: 0, duration: 600, useNativeDriver: false, easing: Easing.out(Easing.cubic) }));
        Animated.parallel(anims).start();
      }, delay);
    });
  }, []);

  const startCountUp = () => {
    if (countsStarted.current) return;
    countsStarted.current = true;
    Animated.parallel([
      Animated.timing(countTrips, { toValue: 500, duration: 1200, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
      Animated.timing(countActivities, { toValue: 1200, duration: 1200, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
      Animated.timing(countSatisfied, { toValue: 98, duration: 1200, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
    ]).start();
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const sy = event.nativeEvent.contentOffset.y;
    const vh = event.nativeEvent.layoutMeasurement.height;

    // Check social proof
    socialProofAnim.check(sy, vh);
    if (sy + vh * 0.85 > socialProofAnim.layoutY.current && !countsStarted.current) {
      startCountUp();
    }

    featureAnims.forEach(a => a.check(sy, vh));
    stepsAnim.check(sy, vh);
    pricingAnim.check(sy, vh);
    faqAnim.check(sy, vh);
    ctaAnim.check(sy, vh);
  };

  const scrollTo = (id: string) => {
    const y = sectionRefs.current[id];
    if (y !== undefined) scrollRef.current?.scrollTo({ y, animated: true });
  };

  const toggleFaq = (index: number) => {
    const isOpen = expandedFaq === index;
    if (expandedFaq !== null) {
      Animated.parallel([
        Animated.timing(faqHeights[expandedFaq], { toValue: 0, duration: 300, useNativeDriver: false }),
        Animated.timing(faqChevrons[expandedFaq], { toValue: 0, duration: 300, useNativeDriver: false }),
      ]).start();
    }
    if (!isOpen) {
      Animated.parallel([
        Animated.timing(faqHeights[index], { toValue: 200, duration: 300, useNativeDriver: false }),
        Animated.timing(faqChevrons[index], { toValue: 1, duration: 300, useNativeDriver: false }),
      ]).start();
    }
    setExpandedFaq(isOpen ? null : index);
  };

  const contentPadding = isMobile ? spacing.md : spacing.xl;
  const sectionPaddingV = isMobile ? spacing.xxl : 72;

  // Feature image hover scale (web only)
  const featureScales = useRef(FEATURES.map(() => new Animated.Value(1))).current;
  const onFeatureHoverIn = (i: number) => {
    if (Platform.OS !== 'web') return;
    Animated.spring(featureScales[i], { toValue: 1.02, useNativeDriver: false, friction: 20 }).start();
  };
  const onFeatureHoverOut = (i: number) => {
    if (Platform.OS !== 'web') return;
    Animated.spring(featureScales[i], { toValue: 1, useNativeDriver: false, friction: 20 }).start();
  };


  const heroParallax = scrollY.interpolate({ inputRange: [0, 500], outputRange: [0, -75], extrapolate: 'clamp' });

  // Nav background: transparent at top, solid white after scrolling ~100px
  const navBg = scrollY.interpolate({ inputRange: [0, 80, 150], outputRange: ['rgba(255,255,255,0)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.95)'], extrapolate: 'clamp' });
  const navBorder = scrollY.interpolate({ inputRange: [0, 150], outputRange: ['rgba(0,0,0,0)', colors.border], extrapolate: 'clamp' });
  const navTextOpacity = scrollY.interpolate({ inputRange: [80, 150], outputRange: [0, 1], extrapolate: 'clamp' });
  const navTextOpacityInv = scrollY.interpolate({ inputRange: [80, 150], outputRange: [1, 0], extrapolate: 'clamp' });

  const PhotoCredit = ({ name, profile, light }: { name: string; profile: string; light?: boolean }) => (
    <Text style={[s.photoCredit, light && { color: 'rgba(0,0,0,0.35)' }]}>
      {'Foto: '}
      <Text style={s.photoCreditLink} onPress={() => Linking.openURL(`${profile}${UTM}`)}>{name}</Text>
      {' / '}
      <Text style={s.photoCreditLink} onPress={() => Linking.openURL(UNSPLASH_URL)}>Unsplash</Text>
    </Text>
  );

  return (
    <View style={s.container}>
      {/* Sticky Nav — transparent over hero, solid on scroll */}
      <Animated.View style={[
        s.nav,
        { paddingTop: insets.top + spacing.xs, paddingHorizontal: contentPadding, backgroundColor: navBg, borderBottomColor: navBorder, borderBottomWidth: 1 },
      ]}>
        <View style={[s.navInner, { maxWidth: MAX_WIDTH }]}>
          {/* White logo (hero) fading out, colored logo (scroll) fading in */}
          <View>
            <Animated.Text style={[s.navLogo, { opacity: navTextOpacityInv }]}>WayFable</Animated.Text>
            <Animated.Text style={[s.navLogo, { color: colors.secondary, position: 'absolute', opacity: navTextOpacity }]}>WayFable</Animated.Text>
          </View>
          <View style={s.navRight}>
            {isDesktop && NAV_ITEMS.map(item => (
              <TouchableOpacity key={item.id} onPress={() => scrollTo(item.id)} style={s.navLinkWrap}>
                <Animated.Text style={[s.navLink, { opacity: navTextOpacityInv }]}>{item.label}</Animated.Text>
                <Animated.Text style={[s.navLink, { color: colors.textSecondary, position: 'absolute', opacity: navTextOpacity }]}>{item.label}</Animated.Text>
              </TouchableOpacity>
            ))}
            {!isMobile && (
              <TouchableOpacity onPress={() => navigation.navigate('Login')} style={s.navGhost}>
                <Animated.Text style={[s.navGhostText, { opacity: navTextOpacityInv }]}>Anmelden</Animated.Text>
                <Animated.Text style={[s.navGhostText, { color: colors.textSecondary, position: 'absolute', opacity: navTextOpacity }]}>Anmelden</Animated.Text>
              </TouchableOpacity>
            )}
            <Animated.View style={{ opacity: navTextOpacityInv }}>
              <TouchableOpacity style={s.navCta} onPress={() => navigation.navigate(isMobile ? 'Login' : 'SignUp')} activeOpacity={0.8}>
                <Text style={s.navCtaText}>{isMobile ? 'Anmelden' : 'Registrieren'}</Text>
              </TouchableOpacity>
            </Animated.View>
            <Animated.View style={{ opacity: navTextOpacity, position: 'absolute', right: 0 }}>
              <TouchableOpacity style={s.navCtaScrolled} onPress={() => navigation.navigate(isMobile ? 'Login' : 'SignUp')} activeOpacity={0.8}>
                <Text style={s.navCtaScrolledText}>{isMobile ? 'Anmelden' : 'Registrieren'}</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </Animated.View>

      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: false,
          listener: handleScroll,
        })}
      >
        {/* ===== HERO ===== */}
        <View style={{ height: Math.max(height * 0.9, 600), overflow: 'hidden' }}>
          <Animated.View style={[StyleSheet.absoluteFillObject, { transform: [{ translateY: heroParallax }] }]}>
            <Image
              source={HERO_IMAGE}
              style={[StyleSheet.absoluteFillObject, { width: '100%', height: '120%' }]}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          </Animated.View>
          <LinearGradient
            colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0.6)']}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={[s.heroContent, { paddingHorizontal: contentPadding }]}>
            <View style={{ maxWidth: 680, width: '100%', alignItems: 'center' }}>
              {/* Badge */}
              <Animated.View style={[s.heroBadge, { opacity: heroBadgeOpacity }]}>
                <Text style={s.heroBadgeText}>Dein Reiseplaner aus der Schweiz</Text>
              </Animated.View>

              {/* Title */}
              <Animated.Text style={[
                s.heroTitle,
                { fontSize: isDesktop ? 56 : isTablet ? 44 : 34, lineHeight: isDesktop ? 66 : isTablet ? 54 : 42, letterSpacing: -0.5 },
                { opacity: heroTitleOpacity, transform: [{ translateY: heroTitleTranslateY }] },
              ]}>
                Plane Traumreisen.{'\n'}Gemeinsam.
              </Animated.Text>

              {/* Subtitle */}
              <Animated.Text style={[
                s.heroSubtitle,
                { fontSize: isMobile ? 16 : 18 },
                { opacity: heroSubOpacity, transform: [{ translateY: heroSubTranslateY }] },
              ]}>
                Organisiere Trips mit Freunden — Tagespläne, Budget, Routen und mehr.{'\n'}Mit Fable, deinem persönlichen Reisebegleiter.
              </Animated.Text>

              {/* CTA */}
              <Animated.View style={[s.heroCtas, { opacity: heroCtaOpacity, transform: [{ translateY: heroCtaTranslateY }] }]}>
                <TouchableOpacity onPress={() => navigation.navigate('SignUp')} activeOpacity={0.8}>
                  <LinearGradient
                    colors={[colors.secondary, colors.sky]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={s.heroBtn}
                  >
                    <Text style={s.heroBtnText}>Kostenlos starten</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>

              <Animated.Text style={[s.heroTrust, { opacity: heroCtaOpacity }]}>
                Keine Kreditkarte nötig · <Text style={{ textDecorationLine: 'underline' }} onPress={() => scrollTo('features')}>Mehr erfahren</Text>
              </Animated.Text>
            </View>
          </View>
          <View style={s.photoCreditWrap}>
            <PhotoCredit name={HERO_ATTR.name} profile={HERO_ATTR.profile} />
          </View>
        </View>

        {/* ===== SOCIAL PROOF ===== */}
        <Animated.View
          style={[s.socialProof, { opacity: socialProofAnim.opacity, transform: [{ translateY: socialProofAnim.translateY }] }]}
          onLayout={socialProofAnim.onLayout}
        >
          <View style={[s.socialProofInner, { maxWidth: MAX_WIDTH, flexDirection: isMobile ? 'column' : 'row' }]}>
            <View style={s.statItem}>
              <CountText value={countTrips} suffix="+" style={s.statNumber} />
              <Text style={s.statLabel}>Reisen geplant</Text>
            </View>
            {!isMobile && <View style={s.statDivider} />}
            <View style={s.statItem}>
              <CountText value={countActivities} suffix="+" style={s.statNumber} />
              <Text style={s.statLabel}>Aktivitäten</Text>
            </View>
            {!isMobile && <View style={s.statDivider} />}
            <View style={s.statItem}>
              <CountText value={countSatisfied} suffix="%" style={s.statNumber} />
              <Text style={s.statLabel}>zufrieden</Text>
            </View>
          </View>
        </Animated.View>

        {/* ===== FEATURES ===== */}
        <View onLayout={(e) => { sectionRefs.current['features'] = e.nativeEvent.layout.y; }}>
          {FEATURES.map((feature, i) => {
            const isEven = i % 2 === 0;
            const bgColor = isEven ? colors.background : colors.card;
            const anim = featureAnims[i];
            const imageOnLeft = isEven;

            const imageBlock = (
              <Animated.View
                style={[
                  s.featureImageWrap,
                  { width: isMobile ? '100%' : '48%', height: isDesktop ? 400 : 250, transform: [{ scale: featureScales[i] }] },
                ]}
                {...(Platform.OS === 'web' ? {
                  onMouseEnter: () => onFeatureHoverIn(i),
                  onMouseLeave: () => onFeatureHoverOut(i),
                } as any : {})}
              >
                <Image
                  source={feature.image}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                <View style={s.featurePhotoCreditWrap}>
                  <PhotoCredit name={feature.attr.name} profile={feature.attr.profile} />
                </View>
              </Animated.View>
            );

            const textBlock = (
              <View style={[s.featureTextWrap, { width: isMobile ? '100%' : '48%' }]}>
                <View style={[s.featureIconCircle, { backgroundColor: `${colors.secondary}18` }]}>
                  <Icon name={feature.icon} size={22} color={colors.secondary} />
                </View>
                <Text style={[s.featureTitle, { fontSize: isDesktop ? 28 : 22 }]}>{feature.title}</Text>
                <Text style={s.featureDesc}>{feature.desc}</Text>
              </View>
            );

            return (
              <Animated.View
                key={i}
                style={[
                  s.featureSection,
                  { backgroundColor: bgColor, paddingVertical: sectionPaddingV, paddingHorizontal: contentPadding },
                  { opacity: anim.opacity, transform: [{ translateY: anim.translateY }] },
                ]}
                onLayout={anim.onLayout}
              >
                <View style={[
                  s.featureRow,
                  { maxWidth: MAX_WIDTH, flexDirection: isMobile ? 'column' : 'row' },
                  !isMobile && !imageOnLeft ? { flexDirection: 'row-reverse' } : {},
                ]}>
                  {imageBlock}
                  {textBlock}
                </View>
              </Animated.View>
            );
          })}
        </View>

        {/* ===== HOW IT WORKS ===== */}
        <Animated.View
          style={[
            s.sectionAlt,
            { paddingVertical: sectionPaddingV, paddingHorizontal: contentPadding },
            { opacity: stepsAnim.opacity, transform: [{ translateY: stepsAnim.translateY }] },
          ]}
          onLayout={stepsAnim.onLayout}
        >
          <Text style={s.sectionTitle}>So einfach geht's</Text>
          <View style={[s.stepsRow, { maxWidth: MAX_WIDTH, flexDirection: isMobile ? 'column' : 'row' }]}>
            {STEPS.map((step, i) => (
              <React.Fragment key={i}>
                <View style={[s.stepCard, !isMobile && { flex: 1 }]}>
                  <LinearGradient colors={[...gradients.ocean]} style={s.stepNumber}>
                    <Text style={s.stepNumberText}>{step.step}</Text>
                  </LinearGradient>
                  <Text style={s.stepTitle}>{step.title}</Text>
                  <Text style={s.stepDesc}>{step.desc}</Text>
                </View>
                {i < STEPS.length - 1 && (
                  <View style={[
                    s.stepConnector,
                    isMobile ? { width: 2, height: 32, alignSelf: 'center' } : { height: 2, flex: 0.3, alignSelf: 'center' },
                  ]} />
                )}
              </React.Fragment>
            ))}
          </View>
        </Animated.View>

        {/* ===== PRICING ===== */}
        <Animated.View
          style={[
            s.section,
            { paddingVertical: sectionPaddingV, paddingHorizontal: contentPadding },
            { opacity: pricingAnim.opacity, transform: [{ translateY: pricingAnim.translateY }] },
          ]}
          onLayout={(e) => {
            sectionRefs.current['pricing'] = e.nativeEvent.layout.y;
            pricingAnim.onLayout(e);
          }}
        >
          <Text style={s.sectionTitle}>Einfache Preise</Text>
          <Text style={s.sectionSubtitle}>Starte kostenlos, upgrade wenn du bereit bist</Text>

          <View style={[s.pricingRow, { maxWidth: MAX_WIDTH, flexDirection: isMobile ? 'column' : 'row' }]}>
            {/* Free */}
            <View style={[s.pricingCard, { width: isMobile ? '100%' : '45%', maxWidth: 400 }]}>
              <Text style={s.pricingTier}>Free</Text>
              <Text style={s.pricingPrice}>CHF 0</Text>
              <Text style={s.pricingPeriod}>für immer</Text>
              <View style={s.pricingFeatures}>
                {FREE_FEATURES.map((f, i) => (
                  <View key={i} style={s.pricingFeatureRow}>
                    <Icon name="checkmark" size={16} color={colors.secondary} />
                    <Text style={s.pricingFeature}>{f}</Text>
                  </View>
                ))}
              </View>
              <Button title="Kostenlos starten" variant="secondary" onPress={() => navigation.navigate('SignUp')} />
            </View>

            {/* Premium */}
            <View style={[
              s.pricingCard, s.pricingCardPremium,
              { width: isMobile ? '100%' : '45%', maxWidth: 400 },
              isDesktop ? { transform: [{ scale: 1.03 }] } : {},
            ]}>
              <LinearGradient
                colors={[...gradients.ocean]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.pricingGradientBar}
              />
              <LinearGradient
                colors={[...gradients.ocean]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.pricingBadge}
              >
                <Text style={s.pricingBadgeText}>Beliebt</Text>
              </LinearGradient>
              <Text style={s.pricingTier}>Premium</Text>
              <Text style={s.pricingPrice}>CHF 9.90</Text>
              <Text style={s.pricingPeriod}>pro Monat</Text>
              <Text style={s.pricingYearly}>oder CHF 99/Jahr (-17%)</Text>
              <View style={s.pricingFeatures}>
                {PREMIUM_FEATURES.map((f, i) => (
                  <View key={i} style={s.pricingFeatureRow}>
                    <Icon name="checkmark" size={16} color={colors.secondary} />
                    <Text style={s.pricingFeature}>{f}</Text>
                  </View>
                ))}
              </View>
              <Button title="Premium starten" onPress={() => navigation.navigate('SignUp')} />
            </View>
          </View>

          <Text style={s.pricingNote}>Oder: 20 Inspirationen für CHF 5 (ohne Abo)</Text>
        </Animated.View>

        {/* ===== FAQ ===== */}
        <Animated.View
          style={[
            s.sectionAlt,
            { paddingVertical: sectionPaddingV, paddingHorizontal: contentPadding },
            { opacity: faqAnim.opacity, transform: [{ translateY: faqAnim.translateY }] },
          ]}
          onLayout={(e) => {
            sectionRefs.current['faq'] = e.nativeEvent.layout.y;
            faqAnim.onLayout(e);
          }}
        >
          <Text style={s.sectionTitle}>Häufige Fragen</Text>
          <View style={{ maxWidth: 700, width: '100%', alignSelf: 'center' }}>
            {FAQS.map((faq, i) => {
              const chevronRotation = faqChevrons[i].interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '180deg'],
              });
              return (
                <TouchableOpacity
                  key={i}
                  style={s.faqCard}
                  onPress={() => toggleFaq(i)}
                  activeOpacity={0.7}
                >
                  <View style={s.faqHeader}>
                    <Text style={s.faqQ}>{faq.q}</Text>
                    <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
                      <Icon name="chevron-down" size={20} color={colors.textSecondary} />
                    </Animated.View>
                  </View>
                  <Animated.View style={{ maxHeight: faqHeights[i], overflow: 'hidden' }}>
                    <Text style={s.faqA}>{faq.a}</Text>
                  </Animated.View>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>

        {/* ===== FINAL CTA ===== */}
        <Animated.View
          style={[
            { height: isMobile ? 400 : 500, overflow: 'hidden' },
            { opacity: ctaAnim.opacity, transform: [{ translateY: ctaAnim.translateY }] },
          ]}
          onLayout={ctaAnim.onLayout}
        >
          <Image
            source={CTA_IMAGE}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.65)']}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={s.ctaContent}>
            <Text style={[s.ctaTitle, { fontSize: isDesktop ? 40 : 30 }]}>Bereit für dein nächstes Abenteuer?</Text>
            <Text style={s.ctaSubtitle}>Erstelle deinen ersten Trip in unter 2 Minuten</Text>
            <TouchableOpacity style={s.heroBtn} onPress={() => navigation.navigate('SignUp')} activeOpacity={0.8}>
              <Text style={s.heroBtnText}>Jetzt kostenlos starten</Text>
            </TouchableOpacity>
          </View>
          <View style={s.photoCreditWrap}>
            <PhotoCredit name={CTA_ATTR.name} profile={CTA_ATTR.profile} />
          </View>
        </Animated.View>

        {/* ===== FOOTER ===== */}
        <View style={[s.footer, { paddingHorizontal: contentPadding }]}>
          <View style={{ maxWidth: MAX_WIDTH, width: '100%', alignItems: 'center' }}>
            <Text style={s.footerLogo}>WayFable</Text>
            <Text style={s.footerTagline}>Dein Reiseplaner aus der Schweiz</Text>
            <View style={s.footerLinks}>
              <TouchableOpacity onPress={() => navigation.navigate('Datenschutz' as any)}>
                <Text style={s.footerLink}>Datenschutz</Text>
              </TouchableOpacity>
              <Text style={s.footerDot}>·</Text>
              <TouchableOpacity onPress={() => navigation.navigate('AGB' as any)}>
                <Text style={s.footerLink}>AGB</Text>
              </TouchableOpacity>
              <Text style={s.footerDot}>·</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Impressum' as any)}>
                <Text style={s.footerLink}>Impressum</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.footerCopy}>© 2026 Gabriel Sommer. Alle Rechte vorbehalten.</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },

  // Nav
  nav: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingBottom: spacing.sm,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  navInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'center',
  },
  navLogo: { fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  navLinkWrap: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  navLink: { ...typography.bodySmall, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  navGhost: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  navGhostText: { ...typography.bodySmall, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  navCta: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  navCtaText: { ...typography.bodySmall, fontWeight: '700', color: '#FFFFFF' },
  navCtaScrolled: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  navCtaScrolledText: { ...typography.bodySmall, fontWeight: '700', color: '#FFFFFF' },

  // Hero
  heroContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroBadge: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  heroBadgeText: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  heroTitle: {
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  heroSubtitle: {
    fontWeight: '400',
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    maxWidth: 480,
    lineHeight: 26,
  },
  heroCtas: {
    alignItems: 'center',
    marginTop: spacing.xl + spacing.sm,
  },
  heroBtn: {
    paddingHorizontal: spacing.xl + spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
  },
  heroBtnText: { ...typography.button, color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  heroTrust: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.5)',
    marginTop: spacing.md,
  },

  // Social Proof
  socialProof: {
    paddingVertical: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  socialProofInner: {
    alignSelf: 'center',
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  statItem: { alignItems: 'center', paddingVertical: spacing.sm },
  statNumber: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.secondary,
    marginBottom: spacing.xs,
  },
  statLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },

  // Feature sections
  featureSection: {},
  featureRow: {
    alignSelf: 'center',
    width: '100%',
    alignItems: 'center',
    gap: spacing.xl,
  },
  featureImageWrap: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.lg,
  },
  featureTextWrap: {
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  featureIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  featureTitle: {
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  featureDesc: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.textSecondary,
    lineHeight: 26,
  },

  // Sections
  section: { backgroundColor: colors.background },
  sectionAlt: { backgroundColor: colors.card },
  sectionTitle: {
    ...typography.h1,
    fontSize: 28,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  sectionSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    maxWidth: 520,
    alignSelf: 'center',
  },

  // Steps
  stepsRow: {
    gap: spacing.md,
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    alignItems: 'center',
  },
  stepCard: { alignItems: 'center', maxWidth: 280 },
  stepNumber: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  stepNumberText: { ...typography.h2, color: '#FFFFFF', fontWeight: '700' },
  stepTitle: { ...typography.h3, textAlign: 'center', marginBottom: spacing.xs },
  stepDesc: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  stepConnector: {
    backgroundColor: colors.border,
    borderRadius: 1,
  },

  // Pricing
  pricingRow: {
    gap: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
  },
  pricingCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    borderWidth: 2,
    borderColor: colors.border,
    ...shadows.sm,
  },
  pricingCardPremium: {
    borderColor: colors.secondary,
    overflow: 'hidden',
    ...shadows.lg,
  },
  pricingGradientBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  pricingBadge: {
    position: 'absolute',
    top: 12,
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
  pricingFeatures: { marginBottom: spacing.lg, marginTop: spacing.md },
  pricingFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  pricingFeature: { ...typography.body },
  pricingNote: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },

  // FAQ
  faqCard: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQ: { ...typography.body, fontWeight: '600', flex: 1, marginRight: spacing.sm },
  faqA: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 22, marginTop: spacing.sm },

  // CTA
  ctaContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  ctaTitle: {
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: spacing.md,
    ...(Platform.OS === 'web'
      ? { textShadow: '0px 2px 8px rgba(0,0,0,0.25)' }
      : { textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }),
  },
  ctaSubtitle: {
    ...typography.body,
    fontSize: 18,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: spacing.xl,
  },

  // Footer
  footer: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    backgroundColor: '#2D3436',
  },
  footerLogo: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: spacing.xs },
  footerTagline: { ...typography.bodySmall, color: 'rgba(255,255,255,0.5)', marginBottom: spacing.lg },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  footerLink: { ...typography.bodySmall, color: 'rgba(255,255,255,0.7)' },
  footerDot: { color: 'rgba(255,255,255,0.3)' },
  footerCopy: { ...typography.caption, color: 'rgba(255,255,255,0.4)' },

  // Photo attribution (matches TripDetailScreen pattern)
  photoCredit: { fontSize: 10, color: 'rgba(255,255,255,0.55)' },
  photoCreditLink: { textDecorationLine: 'underline' as const },
  photoCreditWrap: {
    position: 'absolute' as const,
    bottom: spacing.sm,
    right: spacing.md,
  },
  featurePhotoCreditWrap: {
    position: 'absolute' as const,
    bottom: spacing.xs,
    right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.xs,
  },
});
