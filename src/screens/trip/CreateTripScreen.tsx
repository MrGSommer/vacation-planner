import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRoute, RouteProp } from '@react-navigation/native';
import { Calendar, DateData } from 'react-native-calendars';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Header, Input, Button, Card, PlaceAutocomplete } from '../../components/common';
import { PlaceResult } from '../../components/common/PlaceAutocomplete';
import { UpgradePrompt } from '../../components/common/UpgradePrompt';
import { AiTripModal } from '../../components/ai/AiTripModal';
import { Icon } from '../../utils/icons';
import { useTrips } from '../../hooks/useTrips';
import { useAuthContext } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useToast } from '../../contexts/ToastContext';
import { uploadCoverImage } from '../../api/trips';
import { searchPhotos, triggerDownload, UnsplashPhoto } from '../../api/unsplash';
import { requireOnline } from '../../utils/offlineGate';
import { extractDominantColor } from '../../utils/colorExtraction';
import { colors, spacing, borderRadius, typography, gradients, shadows } from '../../utils/theme';
import { CURRENCIES, DEFAULT_CURRENCY } from '../../utils/constants';
import { formatDate } from '../../utils/dateHelpers';
import { RootStackParamList } from '../../types/navigation';

type Props = { navigation: NativeStackNavigationProp<any> };

export const CreateTripScreen: React.FC<Props> = ({ navigation }) => {
  const route = useRoute<RouteProp<RootStackParamList, 'CreateTrip'>>();
  const { create, update, loading, trips } = useTrips();
  const { user } = useAuthContext();
  const { isFeatureAllowed, canAddTrip, aiCredits } = useSubscription();
  const { showToast } = useToast();
  const [step, setStep] = useState(0);
  const [showAiModal, setShowAiModal] = useState(false);

  // Auto-open Fable modal when navigated with openFable param
  useEffect(() => {
    if (route.params?.openFable) {
      setShowAiModal(true);
      navigation.setParams({ openFable: undefined });
    }
  }, [route.params?.openFable]);

  const activeTrips = trips.filter(t => t.status === 'planning' || t.status === 'upcoming' || t.status === 'active');
  const tripLimitReached = !canAddTrip(activeTrips.length);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [destinationLat, setDestinationLat] = useState<number | null>(null);
  const [destinationLng, setDestinationLng] = useState<number | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [travelersCount, setTravelersCount] = useState(1);
  const [groupType, setGroupType] = useState<'solo' | 'couple' | 'family' | 'friends' | 'group'>('solo');
  const [notes, setNotes] = useState('');

  // Cover image
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [coverAttribution, setCoverAttribution] = useState<string | null>(null);
  const [coverThemeColor, setCoverThemeColor] = useState<string | null>(null);
  const [localUploadUri, setLocalUploadUri] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [unsplashLoading, setUnsplashLoading] = useState(false);
  const unsplashCache = useRef<UnsplashPhoto[]>([]);
  const unsplashIndex = useRef(0);
  const lastQuery = useRef('');
  const coverMode = localUploadUri ? 'upload' : coverAttribution ? 'unsplash' : 'none';

  const handleUnsplashToggle = async () => {
    if (unsplashLoading) return;

    if (coverMode === 'unsplash' && unsplashCache.current.length > 0) {
      unsplashIndex.current = (unsplashIndex.current + 1) % unsplashCache.current.length;
      const photo = unsplashCache.current[unsplashIndex.current];
      setCoverImageUrl(photo.urls.regular);
      setCoverAttribution(`${photo.user.name}|${photo.user.links.html}|${photo.links.html}`);
      setCoverThemeColor(photo.color || null);
      setLocalUploadUri(null);
      triggerDownload(photo);
      return;
    }

    const query = (destination || name).trim();
    if (!query) {
      showToast('Gib zuerst ein Reiseziel oder einen Namen ein', 'info');
      return;
    }

    setUnsplashLoading(true);
    try {
      if (query !== lastQuery.current || unsplashCache.current.length === 0) {
        const results = await searchPhotos(query);
        unsplashCache.current = results;
        unsplashIndex.current = 0;
        lastQuery.current = query;
      }
      if (unsplashCache.current.length > 0) {
        unsplashIndex.current = Math.floor(Math.random() * unsplashCache.current.length);
        const photo = unsplashCache.current[unsplashIndex.current];
        setCoverImageUrl(photo.urls.regular);
        setCoverAttribution(`${photo.user.name}|${photo.user.links.html}|${photo.links.html}`);
        setCoverThemeColor(photo.color || null);
        setLocalUploadUri(null);
        triggerDownload(photo);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUnsplashLoading(false);
    }
  };

  const handlePickImage = async () => {
    if (!requireOnline('Cover-Bild hochladen')) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [16, 9],
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    setLocalUploadUri(uri);
    setCoverImageUrl(uri);
    setCoverAttribution(null);
    setCoverThemeColor(null);
    unsplashCache.current = [];
    unsplashIndex.current = 0;
  };

  const handleClearCover = () => {
    setCoverImageUrl(null);
    setCoverAttribution(null);
    setCoverThemeColor(null);
    setLocalUploadUri(null);
    unsplashCache.current = [];
    unsplashIndex.current = 0;
  };

  const GROUP_TYPES: Array<{ id: typeof groupType; label: string }> = [
    { id: 'solo', label: 'Solo' },
    { id: 'couple', label: 'Paar' },
    { id: 'family', label: 'Familie' },
    { id: 'friends', label: 'Freunde' },
    { id: 'group', label: 'Gruppe' },
  ];

  const handleGroupTypeChange = (type: typeof groupType) => {
    setGroupType(type);
    if (type === 'solo') setTravelersCount(1);
    else if (type === 'couple') setTravelersCount(2);
  };

  const steps = ['Details', 'Daten', 'Optionen'];

  const handleDatePress = (day: DateData) => {
    if (!startDate || (startDate && endDate)) {
      setStartDate(day.dateString);
      setEndDate('');
    } else {
      if (day.dateString < startDate) {
        setStartDate(day.dateString);
      } else {
        setEndDate(day.dateString);
      }
    }
  };

  const getMarkedDates = () => {
    const marked: any = {};
    if (startDate) {
      marked[startDate] = { startingDay: true, color: colors.primary, textColor: '#fff' };
    }
    if (endDate) {
      marked[endDate] = { endingDay: true, color: colors.primary, textColor: '#fff' };
      // fill in between
      const start = new Date(startDate);
      const end = new Date(endDate);
      const current = new Date(start);
      current.setDate(current.getDate() + 1);
      while (current < end) {
        marked[current.toISOString().split('T')[0]] = { color: colors.primaryLight, textColor: '#fff' };
        current.setDate(current.getDate() + 1);
      }
    }
    return marked;
  };

  const canNext = () => {
    if (step === 0) return name.trim() && destination.trim();
    if (step === 1) return startDate && endDate;
    return true;
  };

  const handleCreate = async () => {
    try {
      // For unsplash, pass URL directly; for upload, create trip first then upload
      const isUnsplash = coverMode === 'unsplash';
      const trip = await create({
        name: name.trim(),
        destination: destination.trim(),
        destination_lat: destinationLat,
        destination_lng: destinationLng,
        cover_image_url: isUnsplash ? coverImageUrl : null,
        cover_image_attribution: isUnsplash ? coverAttribution : null,
        theme_color: isUnsplash ? coverThemeColor : null,
        start_date: startDate,
        end_date: endDate,
        status: 'planning',
        currency,
        travelers_count: travelersCount,
        group_type: groupType,
        notes: notes.trim() || null,
        fable_enabled: true,
        fable_budget_visible: true,
        fable_packing_visible: true,
        fable_web_search: true,
        fable_memory_enabled: true,
        fable_instruction: null,
        fable_recap: null,
      });

      // Upload own image after trip creation (needs tripId for storage path)
      if (localUploadUri) {
        try {
          const url = await uploadCoverImage(trip.id, localUploadUri);
          const themeColor = await extractDominantColor(url).catch(() => null);
          // uploadCoverImage already updates cover_image_url; update theme_color separately
          if (themeColor) {
            await update(trip.id, { theme_color: themeColor } as any);
          }
        } catch (e) {
          console.error('Cover upload failed:', e);
        }
      }

      navigation.replace('TripDetail', { tripId: trip.id });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Neue Reise" onBack={() => navigation.goBack()} />

      {/* Progress */}
      <View style={styles.progress}>
        {steps.map((s, i) => (
          <View key={i} style={styles.progressItem}>
            <View style={[styles.progressDot, i <= step && styles.progressDotActive]}>
              <Text style={[styles.progressDotText, i <= step && styles.progressDotTextActive]}>{i + 1}</Text>
            </View>
            <Text style={[styles.progressLabel, i === step && styles.progressLabelActive]}>{s}</Text>
          </View>
        ))}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {step === 0 && (
            <>
              <Text style={styles.stepTitle}>Wohin geht die Reise?</Text>
              <Input label="Reisename" placeholder="z.B. Sommerferien 2026" value={name} onChangeText={setName} />
              <PlaceAutocomplete
                label="Reiseziel"
                placeholder="z.B. Barcelona, Spanien"
                value={destination}
                onChangeText={setDestination}
                onSelect={(place: PlaceResult) => {
                  setDestination(place.name);
                  setDestinationLat(place.lat);
                  setDestinationLng(place.lng);
                }}
              />

              {isFeatureAllowed('ai') ? (
                <TouchableOpacity
                  style={styles.aiButton}
                  onPress={() => setShowAiModal(true)}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={[...gradients.ocean]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.aiButtonGradient}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="sparkles-outline" size={18} color="#FFFFFF" /><Text style={styles.aiButtonText}>Mit Fable planen</Text></View>
                    <Text style={styles.aiButtonSubtext}>Dein Reisebegleiter hilft dir bei der Planung</Text>
                    {aiCredits > 0 && (
                      <Text style={styles.aiButtonSubtext}>{aiCredits} Inspirationen verfügbar</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <View style={styles.aiButton}>
                  <UpgradePrompt
                    iconName="sparkles-outline"
                    title="Mit Fable planen"
                    message="Kaufe Inspirationen um deinen Reisebegleiter zu nutzen"
                    inline
                    buyInspirations
                  />
                </View>
              )}

              <Text style={styles.fieldLabel}>Headerbild</Text>
              {coverImageUrl ? (
                <View style={styles.coverPicker}>
                  <Image source={{ uri: coverImageUrl }} style={styles.coverPreview} />
                  {unsplashLoading && (
                    <View style={styles.coverUploading}>
                      <ActivityIndicator color="#fff" />
                    </View>
                  )}
                </View>
              ) : (
                <View style={[styles.coverPicker, styles.coverPlaceholder]}>
                  <Icon name="image-outline" size={32} color={colors.textLight} />
                  <Text style={styles.coverPlaceholderText}>Kein Bild (Farbverlauf)</Text>
                </View>
              )}
              <View style={styles.coverActions}>
                <TouchableOpacity style={styles.coverActionBtn} onPress={handlePickImage} activeOpacity={0.7}>
                  <Icon name="camera-outline" size={18} color={colors.primary} />
                  <Text style={styles.coverActionText}>Eigenes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.coverActionBtn, coverMode === 'unsplash' && styles.coverActionBtnActive]}
                  onPress={handleUnsplashToggle}
                  disabled={unsplashLoading}
                  activeOpacity={0.7}
                >
                  {unsplashLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Icon name={coverMode === 'unsplash' ? 'refresh-outline' : 'sparkles-outline'} size={18} color={colors.primary} />
                  )}
                  <Text style={styles.coverActionText}>{coverMode === 'unsplash' ? 'Nächstes' : 'Vorschlag'}</Text>
                </TouchableOpacity>
                {coverImageUrl && (
                  <TouchableOpacity style={styles.coverActionBtn} onPress={handleClearCover} activeOpacity={0.7}>
                    <Icon name="close" size={18} color={colors.error} />
                    <Text style={[styles.coverActionText, { color: colors.error }]}>Standard</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {step === 1 && (
            <>
              <Text style={styles.stepTitle}>Wann reist du?</Text>
              {startDate && (
                <Text style={styles.dateDisplay}>
                  {formatDate(startDate)}{endDate ? ` – ${formatDate(endDate)}` : ' – Enddatum wählen'}
                </Text>
              )}
              <Calendar
                onDayPress={handleDatePress}
                markingType="period"
                markedDates={getMarkedDates()}
                theme={{
                  todayTextColor: colors.primary,
                  arrowColor: colors.primary,
                  textDayFontSize: 14,
                  textMonthFontSize: 16,
                  textDayHeaderFontSize: 12,
                }}
              />
            </>
          )}

          {step === 2 && (
            <>
              <Text style={styles.stepTitle}>Weitere Details</Text>

              <Text style={styles.fieldLabel}>Reisegruppe</Text>
              <View style={styles.currencyRow}>
                {GROUP_TYPES.map(g => (
                  <TouchableOpacity
                    key={g.id}
                    style={[styles.currencyChip, groupType === g.id && styles.currencyChipActive]}
                    onPress={() => handleGroupTypeChange(g.id)}
                  >
                    <Text style={[styles.currencyText, groupType === g.id && styles.currencyTextActive]}>{g.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Anzahl Reisende</Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={[styles.stepperBtn, travelersCount <= 1 && styles.stepperBtnDisabled]}
                  onPress={() => setTravelersCount(c => Math.max(1, c - 1))}
                  disabled={travelersCount <= 1}
                >
                  <Text style={[styles.stepperBtnText, travelersCount <= 1 && styles.stepperBtnTextDisabled]}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{travelersCount}</Text>
                <TouchableOpacity
                  style={[styles.stepperBtn, travelersCount >= 20 && styles.stepperBtnDisabled]}
                  onPress={() => setTravelersCount(c => Math.min(20, c + 1))}
                  disabled={travelersCount >= 20}
                >
                  <Text style={[styles.stepperBtnText, travelersCount >= 20 && styles.stepperBtnTextDisabled]}>+</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Währung</Text>
              <View style={styles.currencyRow}>
                {CURRENCIES.map(c => (
                  <TouchableOpacity
                    key={c.code}
                    style={[styles.currencyChip, currency === c.code && styles.currencyChipActive]}
                    onPress={() => setCurrency(c.code)}
                  >
                    <Text style={[styles.currencyText, currency === c.code && styles.currencyTextActive]}>{c.code}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Input label="Notizen" placeholder="Optionale Notizen zur Reise..." value={notes} onChangeText={setNotes} multiline numberOfLines={3} style={{ height: 80, textAlignVertical: 'top' }} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {tripLimitReached ? (
        <View style={styles.footer}>
          <UpgradePrompt
            iconName="airplane-outline"
            title="Trip-Limit erreicht"
            message="Upgrade auf Premium für unbegrenzte Trips"
            inline
          />
        </View>
      ) : (
        <View style={styles.footer}>
          {step > 0 && <Button title="Zurück" onPress={() => setStep(s => s - 1)} variant="ghost" style={styles.footerButton} />}
          {step < 2 ? (
            <Button title="Weiter" onPress={() => setStep(s => s + 1)} disabled={!canNext()} style={[styles.footerButton, styles.footerNext]} />
          ) : (
            <Button title="Reise erstellen" onPress={handleCreate} loading={loading} disabled={!canNext()} style={[styles.footerButton, styles.footerNext]} />
          )}
        </View>
      )}

      {user && (
        <AiTripModal
          visible={showAiModal}
          onClose={() => setShowAiModal(false)}
          mode="create"
          userId={user.id}
          initialContext={{
            destination,
            destinationLat,
            destinationLng,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            currency,
            travelersCount,
            groupType,
          }}
          onComplete={(tripId) => {
            setShowAiModal(false);
            navigation.replace('TripDetail', { tripId });
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  progress: { flexDirection: 'row', justifyContent: 'center', padding: spacing.md, gap: spacing.xl },
  progressItem: { alignItems: 'center' },
  progressDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  progressDotActive: { backgroundColor: colors.primary },
  progressDotText: { ...typography.bodySmall, fontWeight: '600', color: colors.textLight },
  progressDotTextActive: { color: '#FFFFFF' },
  progressLabel: { ...typography.caption, marginTop: 4 },
  progressLabelActive: { color: colors.primary, fontWeight: '600' },
  content: { padding: spacing.xl },
  stepTitle: { ...typography.h2, marginBottom: spacing.lg },
  dateDisplay: { ...typography.body, color: colors.primary, fontWeight: '600', marginBottom: spacing.md, textAlign: 'center' },
  fieldLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  currencyRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  currencyChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.full, borderWidth: 1.5, borderColor: colors.border },
  currencyChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  currencyText: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  currencyTextActive: { color: '#FFFFFF' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  stepperBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepperBtnDisabled: { borderColor: colors.border },
  stepperBtnText: { fontSize: 20, color: colors.primary, fontWeight: '600', lineHeight: 22 },
  stepperBtnTextDisabled: { color: colors.border },
  stepperValue: { ...typography.h2, minWidth: 32, textAlign: 'center' },
  coverPicker: { borderRadius: borderRadius.lg, overflow: 'hidden', marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  coverPreview: { width: '100%', height: 160 },
  coverPlaceholder: { height: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  coverPlaceholderText: { ...typography.bodySmall, color: colors.textLight },
  coverUploading: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  coverActions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  coverActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  coverActionBtnActive: { borderColor: colors.primary },
  coverActionText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  aiButton: { marginTop: spacing.md, marginBottom: spacing.md },
  aiButtonGradient: { padding: spacing.md, borderRadius: borderRadius.lg, alignItems: 'center', ...shadows.sm },
  aiButtonText: { ...typography.button, color: '#FFFFFF', marginBottom: 2 },
  aiButtonSubtext: { ...typography.caption, color: 'rgba(255,255,255,0.8)' },
  footer: { flexDirection: 'row', padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  footerButton: { flex: 1 },
  footerNext: { marginLeft: spacing.sm },
});
