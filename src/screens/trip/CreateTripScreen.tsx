import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Calendar, DateData } from 'react-native-calendars';
import { Header, Input, Button, Card } from '../../components/common';
import { useTrips } from '../../hooks/useTrips';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { CURRENCIES, DEFAULT_CURRENCY } from '../../utils/constants';
import { formatDate } from '../../utils/dateHelpers';

type Props = { navigation: NativeStackNavigationProp<any> };

export const CreateTripScreen: React.FC<Props> = ({ navigation }) => {
  const { create, loading } = useTrips();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [notes, setNotes] = useState('');

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
      const trip = await create({
        name: name.trim(),
        destination: destination.trim(),
        destination_lat: null,
        destination_lng: null,
        cover_image_url: null,
        start_date: startDate,
        end_date: endDate,
        status: 'planning',
        currency,
        notes: notes.trim() || null,
      });
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
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <>
              <Text style={styles.stepTitle}>Wohin geht die Reise?</Text>
              <Input label="Reisename" placeholder="z.B. Sommerferien 2026" value={name} onChangeText={setName} />
              <Input label="Reiseziel" placeholder="z.B. Barcelona, Spanien" value={destination} onChangeText={setDestination} />
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
          <Button title="Reise erstellen" onPress={handleCreate} loading={loading} disabled={!canNext()} style={[styles.footerButton, styles.footerNext]} />
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
  footer: { flexDirection: 'row', padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  footerButton: { flex: 1 },
  footerNext: { marginLeft: spacing.sm },
});
