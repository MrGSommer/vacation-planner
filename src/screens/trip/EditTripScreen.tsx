import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, Alert, Image } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Calendar, DateData } from 'react-native-calendars';
import * as ImagePicker from 'expo-image-picker';
import { Header, Input, Button, PlaceAutocomplete } from '../../components/common';
import { PlaceResult } from '../../components/common/PlaceAutocomplete';
import { useTrips } from '../../hooks/useTrips';
import { getTrip, uploadCoverImage } from '../../api/trips';
import { getDays, getActivities, deleteDay, moveActivitiesToDay } from '../../api/itineraries';
import { Trip } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { CURRENCIES } from '../../utils/constants';
import { formatDate, getDayDates } from '../../utils/dateHelpers';
import { LoadingScreen } from '../../components/common';

type Props = NativeStackScreenProps<RootStackParamList, 'EditTrip'>;

export const EditTripScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const { update, loading: saving } = useTrips();
  const [loadingTrip, setLoadingTrip] = useState(true);
  const [originalTrip, setOriginalTrip] = useState<Trip | null>(null);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [destinationLat, setDestinationLat] = useState<number | null>(null);
  const [destinationLng, setDestinationLng] = useState<number | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState('');
  const [notes, setNotes] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const steps = ['Details', 'Daten', 'Optionen'];

  useEffect(() => {
    const load = async () => {
      try {
        const trip = await getTrip(tripId);
        setOriginalTrip(trip);
        setName(trip.name);
        setDestination(trip.destination);
        setDestinationLat(trip.destination_lat);
        setDestinationLng(trip.destination_lng);
        setStartDate(trip.start_date);
        setEndDate(trip.end_date);
        setCurrency(trip.currency);
        setNotes(trip.notes || '');
        setCoverImageUrl(trip.cover_image_url);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingTrip(false);
      }
    };
    load();
  }, [tripId]);

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

  const handleSave = async () => {
    if (!originalTrip) return;

    const datesChanged = startDate !== originalTrip.start_date || endDate !== originalTrip.end_date;

    if (datesChanged) {
      const oldDates = getDayDates(originalTrip.start_date, originalTrip.end_date);
      const newDates = getDayDates(startDate, endDate);
      const newDatesSet = new Set(newDates);
      const removedDates = oldDates.filter(d => !newDatesSet.has(d));

      if (removedDates.length > 0) {
        // Check for activities on removed days
        const existingDays = await getDays(tripId);
        const removedDays = existingDays.filter(d => removedDates.includes(d.date));

        let affectedActivities: { id: string; day_id: string }[] = [];
        for (const day of removedDays) {
          const acts = await getActivities(day.id);
          affectedActivities.push(...acts.map(a => ({ id: a.id, day_id: day.id })));
        }

        if (affectedActivities.length > 0) {
          return new Promise<void>((resolve) => {
            Alert.alert(
              'Aktivitäten betroffen',
              `${affectedActivities.length} Aktivität(en) liegen auf Tagen ausserhalb der neuen Datumsspanne.`,
              [
                {
                  text: 'Abbrechen',
                  style: 'cancel',
                  onPress: () => resolve(),
                },
                {
                  text: 'Löschen',
                  style: 'destructive',
                  onPress: async () => {
                    // Delete removed days (cascade deletes activities via DB)
                    for (const day of removedDays) {
                      await deleteDay(day.id);
                    }
                    await saveTrip();
                    resolve();
                  },
                },
                {
                  text: 'Verschieben',
                  onPress: async () => {
                    // Find or create the nearest new day to move activities to
                    const allDays = await getDays(tripId);
                    const newFirstDate = newDates[0];
                    const newLastDate = newDates[newDates.length - 1];

                    for (const day of removedDays) {
                      const acts = await getActivities(day.id);
                      if (acts.length === 0) continue;

                      // Determine target date: closest boundary
                      const targetDate = day.date < newFirstDate ? newFirstDate : newLastDate;
                      let targetDay = allDays.find(d => d.date === targetDate);

                      if (!targetDay) {
                        // Create the day
                        const { createDay } = await import('../../api/itineraries');
                        targetDay = await createDay(tripId, targetDate);
                      }

                      await moveActivitiesToDay(acts.map(a => a.id), targetDay.id);
                    }

                    // Delete now-empty removed days
                    for (const day of removedDays) {
                      await deleteDay(day.id);
                    }
                    await saveTrip();
                    resolve();
                  },
                },
              ],
            );
          });
        }
      }
    }

    await saveTrip();
  };

  const saveTrip = async () => {
    try {
      await update(tripId, {
        name: name.trim(),
        destination: destination.trim(),
        destination_lat: destinationLat,
        destination_lng: destinationLng,
        start_date: startDate,
        end_date: endDate,
        currency,
        notes: notes.trim() || null,
      });
      navigation.goBack();
    } catch (e) {
      console.error(e);
    }
  };

  if (loadingTrip) return <LoadingScreen />;

  return (
    <View style={styles.container}>
      <Header title="Reise bearbeiten" onBack={() => navigation.goBack()} />

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
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <>
              <Text style={styles.stepTitle}>Reisedetails</Text>
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
              <Text style={styles.fieldLabel}>Headerbild</Text>
              <TouchableOpacity
                style={styles.coverPicker}
                onPress={async () => {
                  const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    quality: 0.7,
                    allowsEditing: true,
                    aspect: [16, 9],
                  });
                  if (result.canceled) return;
                  setUploadingCover(true);
                  try {
                    const url = await uploadCoverImage(tripId, result.assets[0].uri);
                    setCoverImageUrl(url);
                  } catch (e) {
                    Alert.alert('Fehler', 'Bild konnte nicht hochgeladen werden');
                  } finally {
                    setUploadingCover(false);
                  }
                }}
                activeOpacity={0.7}
              >
                {coverImageUrl ? (
                  <Image source={{ uri: coverImageUrl }} style={styles.coverPreview} />
                ) : (
                  <View style={styles.coverPlaceholder}>
                    <Text style={styles.coverPlaceholderIcon}>📷</Text>
                    <Text style={styles.coverPlaceholderText}>Bild auswählen</Text>
                  </View>
                )}
                {uploadingCover && (
                  <View style={styles.coverUploading}>
                    <Text style={styles.coverUploadingText}>Wird hochgeladen...</Text>
                  </View>
                )}
              </TouchableOpacity>
              {coverImageUrl && (
                <TouchableOpacity onPress={() => { setCoverImageUrl(null); update(tripId, { cover_image_url: null }); }}>
                  <Text style={styles.coverRemove}>Bild entfernen</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <Text style={styles.stepTitle}>Reisedaten</Text>
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

      <View style={styles.footer}>
        {step > 0 && <Button title="Zurück" onPress={() => setStep(s => s - 1)} variant="ghost" style={styles.footerButton} />}
        {step < 2 ? (
          <Button title="Weiter" onPress={() => setStep(s => s + 1)} disabled={!canNext()} style={[styles.footerButton, styles.footerNext]} />
        ) : (
          <Button title="Speichern" onPress={handleSave} loading={saving} disabled={!canNext()} style={[styles.footerButton, styles.footerNext]} />
        )}
      </View>
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
  coverPicker: { borderRadius: borderRadius.lg, overflow: 'hidden', marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  coverPreview: { width: '100%', height: 160, borderRadius: borderRadius.lg },
  coverPlaceholder: { height: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  coverPlaceholderIcon: { fontSize: 32, marginBottom: spacing.xs },
  coverPlaceholderText: { ...typography.bodySmall, color: colors.textLight },
  coverUploading: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.lg },
  coverUploadingText: { color: '#fff', ...typography.bodySmall, fontWeight: '600' },
  coverRemove: { ...typography.bodySmall, color: colors.error, marginBottom: spacing.md },
  footer: { flexDirection: 'row', padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  footerButton: { flex: 1 },
  footerNext: { marginLeft: spacing.sm },
});
