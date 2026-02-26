import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Input } from './Input';
import { DatePickerInput } from './DatePickerInput';
import { TimePickerInput } from './TimePickerInput';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import { PlaceResult } from './PlaceAutocomplete';
import { CATEGORY_FIELDS, CategoryField } from '../../utils/categoryFields';
import { lookupFlight, isValidFlightNumber, FlightInfo } from '../../utils/flightLookup';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

interface Props {
  category: string;
  data: Record<string, any>;
  onChange: (data: Record<string, any>) => void;
  tripStartDate?: string;
  tripEndDate?: string;
}

// Maps end-date keys to their corresponding start-date keys (for minDate constraint)
const DATE_PAIRS: Record<string, string> = {
  check_out_date: 'check_in_date',
};

export const CategoryFieldsInput: React.FC<Props> = ({ category, data, onChange, tripStartDate, tripEndDate }) => {
  const fields = CATEGORY_FIELDS[category];
  if (!fields || fields.length === 0) return null;

  const isFlightTransport = category === 'transport' && data.transport_type === 'Flug';

  const update = (key: string, value: any) => {
    onChange({ ...data, [key]: value });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Details</Text>
      {fields.map((field) => {
        // Inject flight lookup UI after reference_number field for flights
        const elements: React.ReactNode[] = [];

        switch (field.type) {
          case 'text':
            elements.push(
              <Input
                key={field.key}
                label={field.label}
                placeholder={field.placeholder}
                value={data[field.key] || ''}
                onChangeText={(v: string) => update(field.key, v)}
              />,
            );
            break;
          case 'time':
            elements.push(
              <TimePickerInput
                key={field.key}
                label={field.label}
                value={data[field.key] || ''}
                onChange={(v: string) => update(field.key, v)}
                placeholder={field.placeholder}
              />,
            );
            break;
          case 'date': {
            const startKey = DATE_PAIRS[field.key];
            const startValue = startKey ? data[startKey] : undefined;
            elements.push(
              <DatePickerInput
                key={field.key}
                label={field.label}
                value={data[field.key] || ''}
                onChange={(v: string) => update(field.key, v)}
                placeholder={field.placeholder}
                initialDate={startValue || tripStartDate || undefined}
                minDate={startValue || tripStartDate || undefined}
                maxDate={tripEndDate || undefined}
              />,
            );
            break;
          }
          case 'select':
            elements.push(
              <View key={field.key} style={styles.selectContainer}>
                <Text style={styles.fieldLabel}>{field.label}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {(field.options || []).map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.chip, data[field.key] === opt && styles.chipActive]}
                      onPress={() => update(field.key, data[field.key] === opt ? '' : opt)}
                    >
                      <Text style={[styles.chipText, data[field.key] === opt && styles.chipTextActive]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>,
            );
            break;
          case 'place':
            elements.push(
              <PlaceAutocomplete
                key={field.key}
                label={field.label}
                placeholder={field.placeholder}
                value={data[`${field.key}_name`] || ''}
                onChangeText={(v: string) => update(`${field.key}_name`, v)}
                onSelect={(place: PlaceResult) => {
                  onChange({
                    ...data,
                    [`${field.key}_name`]: place.name,
                    [`${field.key}_lat`]: place.lat,
                    [`${field.key}_lng`]: place.lng,
                  });
                }}
              />,
            );
            break;
          default:
            break;
        }

        // Add flight lookup widget after reference_number when transport_type is Flug
        if (field.key === 'reference_number' && isFlightTransport) {
          elements.push(
            <FlightLookupWidget
              key="flight-lookup"
              flightNumber={data.reference_number || ''}
              onApply={(flight) => {
                const updates: Record<string, any> = { ...data };
                if (flight.airline_name) updates.carrier = flight.airline_name;
                if (flight.dep_city && flight.dep_airport) {
                  updates.departure_station_name = `${flight.dep_city} (${flight.dep_airport})`;
                }
                if (flight.arr_city && flight.arr_airport) {
                  updates.arrival_station_name = `${flight.arr_city} (${flight.arr_airport})`;
                }
                if (flight.dep_time_local) {
                  const depParts = flight.dep_time_local.split(/[T ]/);
                  if (depParts[0]) updates.departure_date = depParts[0];
                  if (depParts[1]) updates.departure_time = depParts[1].substring(0, 5);
                }
                if (flight.arr_time_local) {
                  const arrParts = flight.arr_time_local.split(/[T ]/);
                  if (arrParts[0]) updates.arrival_date = arrParts[0];
                  if (arrParts[1]) updates.arrival_time = arrParts[1].substring(0, 5);
                }
                // Mark as verified so live tracking knows API data was confirmed
                updates.flight_verified = true;
                updates.flight_iata = flight.flight_iata;
                onChange(updates);
              }}
            />,
          );
        }

        return elements;
      })}
    </View>
  );
};

// --- Flight Lookup Widget ---

interface FlightLookupWidgetProps {
  flightNumber: string;
  onApply: (flight: FlightInfo) => void;
}

const FlightLookupWidget: React.FC<FlightLookupWidgetProps> = ({ flightNumber, onApply }) => {
  const [loading, setLoading] = useState(false);
  const [flight, setFlight] = useState<FlightInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLookedUp = useRef('');

  const doLookup = useCallback(async (num: string) => {
    const normalized = num.toUpperCase().replace(/\s/g, '');
    if (normalized === lastLookedUp.current) return;
    lastLookedUp.current = normalized;

    setLoading(true);
    setError(null);
    setFlight(null);

    try {
      const result = await lookupFlight(normalized);
      if (result?.found) {
        setFlight(result);
      } else {
        setError('Flug nicht gefunden');
      }
    } catch {
      setError('Fehler bei der Flugsuche');
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced auto-lookup
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = flightNumber.trim();
    if (trimmed.length < 4 || !isValidFlightNumber(trimmed)) {
      setFlight(null);
      setError(null);
      lastLookedUp.current = '';
      return;
    }

    debounceRef.current = setTimeout(() => doLookup(trimmed), 800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [flightNumber, doLookup]);

  if (!flightNumber.trim() || flightNumber.trim().length < 3) return null;

  if (loading) {
    return (
      <View style={flightStyles.container}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={flightStyles.loadingText}>Flugdaten werden gesucht...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[flightStyles.container, flightStyles.errorContainer]}>
        <Text style={flightStyles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!flight) return null;

  const depTime = flight.dep_time_local?.split(/[T ]/)[1]?.substring(0, 5) || '';
  const arrTime = flight.arr_time_local?.split(/[T ]/)[1]?.substring(0, 5) || '';

  return (
    <View style={flightStyles.container}>
      <View style={flightStyles.header}>
        <Text style={flightStyles.flightBadge}>{flight.flight_iata}</Text>
        {flight.airline_name && <Text style={flightStyles.airline}>{flight.airline_name}</Text>}
        {flight.status && <Text style={flightStyles.status}>{flight.status}</Text>}
      </View>

      <View style={flightStyles.route}>
        <View style={flightStyles.airport}>
          <Text style={flightStyles.airportCode}>{flight.dep_airport || '?'}</Text>
          <Text style={flightStyles.cityName}>{flight.dep_city || ''}</Text>
          {depTime ? <Text style={flightStyles.time}>{depTime}</Text> : null}
          {flight.dep_terminal && <Text style={flightStyles.terminal}>T{flight.dep_terminal}{flight.dep_gate ? ` / Gate ${flight.dep_gate}` : ''}</Text>}
        </View>
        <View style={flightStyles.arrow}>
          <Text style={flightStyles.arrowText}>{'→'}</Text>
          {flight.duration_min && <Text style={flightStyles.duration}>{Math.floor(flight.duration_min / 60)}h{String(flight.duration_min % 60).padStart(2, '0')}</Text>}
        </View>
        <View style={flightStyles.airport}>
          <Text style={flightStyles.airportCode}>{flight.arr_airport || '?'}</Text>
          <Text style={flightStyles.cityName}>{flight.arr_city || ''}</Text>
          {arrTime ? <Text style={flightStyles.time}>{arrTime}</Text> : null}
          {flight.arr_terminal && <Text style={flightStyles.terminal}>T{flight.arr_terminal}{flight.arr_gate ? ` / Gate ${flight.arr_gate}` : ''}</Text>}
        </View>
      </View>

      <TouchableOpacity style={flightStyles.applyBtn} onPress={() => onApply(flight)} activeOpacity={0.7}>
        <Text style={flightStyles.applyBtnText}>Flugdaten übernehmen</Text>
      </TouchableOpacity>
    </View>
  );
};

const flightStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.primary + '08',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '30',
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorContainer: {
    borderColor: colors.error + '30',
    backgroundColor: colors.error + '08',
  },
  loadingText: { ...typography.bodySmall, color: colors.textSecondary, marginLeft: spacing.sm },
  errorText: { ...typography.bodySmall, color: colors.error },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  flightBadge: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primary + '15',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  airline: { ...typography.bodySmall, fontWeight: '600', color: colors.text, flex: 1 },
  status: { ...typography.caption, color: colors.textSecondary, textTransform: 'capitalize' },
  route: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.md },
  airport: { alignItems: 'center', flex: 1 },
  airportCode: { ...typography.h3, fontWeight: '700', color: colors.text },
  cityName: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  time: { ...typography.body, fontWeight: '600', color: colors.primary, marginTop: 4 },
  terminal: { ...typography.caption, color: colors.textLight, marginTop: 2 },
  arrow: { alignItems: 'center', justifyContent: 'center', paddingTop: 4 },
  arrowText: { fontSize: 20, color: colors.textLight },
  duration: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  applyBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  applyBtnText: { ...typography.bodySmall, fontWeight: '600', color: '#FFFFFF' },
});

const styles = StyleSheet.create({
  container: { marginTop: spacing.sm },
  sectionLabel: { ...typography.bodySmall, fontWeight: '700', color: colors.primary, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
  selectContainer: { marginBottom: spacing.md },
  fieldLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    minHeight: 44,
    justifyContent: 'center' as const,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  chipText: { ...typography.caption, color: colors.textSecondary },
  chipTextActive: { color: colors.primary, fontWeight: '600' },
});
