import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Input } from './Input';
import { DatePickerInput } from './DatePickerInput';
import { TimePickerInput } from './TimePickerInput';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import { PlaceResult } from './PlaceAutocomplete';
import { AirportAutocomplete } from './AirportAutocomplete';
import { Airport } from '../../data/airports';
import { CATEGORY_FIELDS, CategoryField, getTransportFields } from '../../utils/categoryFields';
import { lookupFlight, isValidFlightNumber, FlightInfo, searchFlightsByRoute, RouteFlightInfo } from '../../utils/flightLookup';
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
  arrival_date: 'departure_date',
};

export const CategoryFieldsInput: React.FC<Props> = ({ category, data, onChange, tripStartDate, tripEndDate }) => {
  const baseFields = CATEGORY_FIELDS[category];
  if (!baseFields || baseFields.length === 0) return null;

  // For transport: base fields = [transport_type selector], then add type-specific fields
  const transportTypeFields = useMemo(() => {
    if (category !== 'transport') return [];
    return getTransportFields(data.transport_type);
  }, [category, data.transport_type]);

  const fields = category === 'transport'
    ? [...baseFields, ...transportTypeFields]
    : baseFields;

  const isFlightTransport = category === 'transport' && data.transport_type === 'Flug';

  const update = (key: string, value: any) => {
    onChange({ ...data, [key]: value });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Details</Text>
      {fields.map((field) => {
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
          case 'airport':
            elements.push(
              <AirportAutocomplete
                key={field.key}
                label={field.label}
                placeholder={field.placeholder}
                value={data[`${field.key}_name`] || ''}
                onChangeText={(v: string) => update(`${field.key}_name`, v)}
                onSelect={(airport: Airport) => {
                  onChange({
                    ...data,
                    [`${field.key}_name`]: `${airport.city} (${airport.iata})`,
                    [field.key]: airport.iata,
                  });
                }}
              />,
            );
            break;
          default:
            break;
        }

        // Add route search widget after arrival_station when both airports selected but no flight number
        if (field.key === 'arrival_station' && isFlightTransport && data.departure_station && data.arrival_station && !data.reference_number) {
          elements.push(
            <RouteSearchWidget
              key="route-search"
              depIata={data.departure_station}
              arrIata={data.arrival_station}
              depCityName={data.departure_station_name || data.departure_station}
              arrCityName={data.arrival_station_name || data.arrival_station}
              departureDate={data.departure_date || undefined}
              onSelect={(route) => {
                const updates: Record<string, any> = { ...data };
                updates.reference_number = route.flight_iata;
                if (route.airline_name) updates.carrier = route.airline_name;
                if (route.dep_time) updates.departure_time = route.dep_time.substring(0, 5);
                if (route.arr_time) updates.arrival_time = route.arr_time.substring(0, 5);
                onChange(updates);
              }}
            />,
          );
        }

        // Add flight lookup widget after reference_number when transport_type is Flug
        if (field.key === 'reference_number' && isFlightTransport) {
          elements.push(
            <FlightLookupWidget
              key="flight-lookup"
              flightNumber={data.reference_number || ''}
              flightDate={data.departure_date || undefined}
              onApply={(flight) => {
                const updates: Record<string, any> = { ...data };
                if (flight.flight_iata) {
                  updates.reference_number = flight.flight_iata;
                }
                if (flight.airline_name) updates.carrier = flight.airline_name;
                if (flight.dep_city && flight.dep_airport) {
                  updates.departure_station_name = `${flight.dep_city} (${flight.dep_airport})`;
                  updates.departure_station = flight.dep_airport;
                }
                if (flight.arr_city && flight.arr_airport) {
                  updates.arrival_station_name = `${flight.arr_city} (${flight.arr_airport})`;
                  updates.arrival_station = flight.arr_airport;
                }
                if (flight.dep_time_local) {
                  const depParts = flight.dep_time_local.split(/[T ]/);
                  if (depParts.length >= 2) {
                    // Full datetime "YYYY-MM-DD HH:MM" → date + time
                    updates.departure_time = depParts[1].substring(0, 5);
                    if (!data.departure_date && depParts[0]) updates.departure_date = depParts[0];
                  } else if (/^\d{2}:\d{2}/.test(depParts[0])) {
                    // Time-only "HH:MM" → just time, no date
                    updates.departure_time = depParts[0].substring(0, 5);
                  }
                }
                if (flight.arr_time_local) {
                  const arrParts = flight.arr_time_local.split(/[T ]/);
                  if (arrParts.length >= 2) {
                    // Full datetime "YYYY-MM-DD HH:MM" → date + time
                    updates.arrival_date = arrParts[0];
                    updates.arrival_time = arrParts[1].substring(0, 5);
                  } else if (/^\d{2}:\d{2}/.test(arrParts[0])) {
                    // Time-only "HH:MM" → just time, no date
                    updates.arrival_time = arrParts[0].substring(0, 5);
                  }
                }
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
  flightDate?: string;
  onApply: (flight: FlightInfo) => void;
}

const FlightLookupWidget: React.FC<FlightLookupWidgetProps> = ({ flightNumber, flightDate, onApply }) => {
  const [loading, setLoading] = useState(false);
  const [flight, setFlight] = useState<FlightInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastLookedUp = useRef('');

  // Reset flight/error when flightNumber changes (user is editing)
  useEffect(() => {
    const normalized = flightNumber.toUpperCase().replace(/\s/g, '');
    const cacheKey = `${normalized}_${flightDate || ''}`;
    if (cacheKey !== lastLookedUp.current) {
      setFlight(null);
      setError(null);
    }
  }, [flightNumber, flightDate]);

  const doLookup = useCallback(async () => {
    const trimmed = flightNumber.trim();
    if (!trimmed || !isValidFlightNumber(trimmed)) {
      setError('Ungültige Flugnummer');
      return;
    }
    if (!flightDate) {
      setError('Bitte zuerst ein Abfahrtsdatum wählen');
      return;
    }

    const normalized = trimmed.toUpperCase().replace(/\s/g, '');
    const cacheKey = `${normalized}_${flightDate}`;
    if (cacheKey === lastLookedUp.current && flight) return; // Already have this result
    lastLookedUp.current = cacheKey;

    setLoading(true);
    setError(null);
    setFlight(null);

    try {
      const result = await lookupFlight(normalized, flightDate);
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
  }, [flightNumber, flightDate, flight]);

  if (!flightNumber.trim() || flightNumber.trim().length < 3) return null;

  // Show search button when no result yet and not loading
  if (!flight && !loading) {
    return (
      <View style={flightStyles.container}>
        {error && (
          <Text style={[flightStyles.errorText, { marginBottom: spacing.sm }]}>{error}</Text>
        )}
        <TouchableOpacity style={flightStyles.searchBtn} onPress={doLookup} activeOpacity={0.7}>
          <Text style={flightStyles.searchBtnText}>Flugdaten suchen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={flightStyles.container}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={flightStyles.loadingText}>Flugdaten werden gesucht...</Text>
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

// --- Route Search Widget ---

interface RouteSearchWidgetProps {
  depIata: string;
  arrIata: string;
  depCityName: string;
  arrCityName: string;
  departureDate?: string; // YYYY-MM-DD — required before searching
  onSelect: (route: RouteFlightInfo) => void;
}

const DAY_NAMES = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Get AirLabs day number (1=Mon..7=Sun) from a YYYY-MM-DD string */
function getAirLabsDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const jsDay = d.getDay(); // 0=Sun..6=Sat
  return String(jsDay === 0 ? 7 : jsDay);
}

const RouteSearchWidget: React.FC<RouteSearchWidgetProps> = ({ depIata, arrIata, depCityName, arrCityName, departureDate, onSelect }) => {
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState<RouteFlightInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const lastSearchRef = useRef('');

  // Reset when airports or date change
  useEffect(() => {
    const key = `${depIata}_${arrIata}_${departureDate || ''}`;
    if (key !== lastSearchRef.current) {
      setRoutes([]);
      setError(null);
      setSearched(false);
    }
  }, [depIata, arrIata, departureDate]);

  const doSearch = useCallback(async () => {
    if (!departureDate) return;
    const key = `${depIata}_${arrIata}_${departureDate}`;
    lastSearchRef.current = key;
    setLoading(true);
    setError(null);
    setRoutes([]);
    try {
      const result = await searchFlightsByRoute(depIata, arrIata);
      // Filter by operating day of week
      const dayNum = getAirLabsDay(departureDate);
      const filtered = result.filter(r =>
        !r.days || r.days.length === 0 || r.days.includes(dayNum),
      );
      if (filtered.length > 0) {
        setRoutes(filtered);
      } else if (result.length > 0) {
        setError(`Keine Flüge am ${DAY_NAMES[parseInt(dayNum)]} auf dieser Route`);
      } else {
        setError('Keine Flüge auf dieser Route gefunden');
      }
      setSearched(true);
    } catch {
      setError('Fehler bei der Routensuche');
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, [depIata, arrIata, departureDate]);

  if (!searched && !loading) {
    return (
      <View style={routeStyles.container}>
        <Text style={routeStyles.hint}>
          Flugnummer nicht bekannt? Verfügbare Flüge {depCityName} {'→'} {arrCityName} suchen:
        </Text>
        {!departureDate ? (
          <Text style={routeStyles.dateHint}>Bitte zuerst ein Abfahrtsdatum wählen</Text>
        ) : (
          <TouchableOpacity style={routeStyles.searchBtn} onPress={doSearch} activeOpacity={0.7}>
            <Text style={routeStyles.searchBtnText}>Flüge auf Route suchen</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={routeStyles.container}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={routeStyles.loadingText}>Flüge werden gesucht...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={routeStyles.container}>
        <Text style={routeStyles.errorText}>{error}</Text>
        <TouchableOpacity style={routeStyles.retryBtn} onPress={doSearch} activeOpacity={0.7}>
          <Text style={routeStyles.retryBtnText}>Erneut suchen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={routeStyles.container}>
      <Text style={routeStyles.resultHeader}>{routes.length} Flüge gefunden</Text>
      <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled>
        {routes.map((route) => {
          const depTime = route.dep_time?.substring(0, 5) || '?';
          const arrTime = route.arr_time?.substring(0, 5) || '?';
          const durationH = route.duration ? Math.floor(route.duration / 60) : null;
          const durationM = route.duration ? route.duration % 60 : null;
          const daysStr = route.days?.length > 0
            ? route.days.map(d => DAY_NAMES[parseInt(d)] || d).join(', ')
            : 'Täglich';

          return (
            <TouchableOpacity
              key={route.flight_iata}
              style={routeStyles.routeItem}
              onPress={() => onSelect(route)}
              activeOpacity={0.6}
            >
              <View style={routeStyles.routeRow}>
                <Text style={routeStyles.flightCode}>{route.flight_iata}</Text>
                {route.airline_name && <Text style={routeStyles.airlineName} numberOfLines={1}>{route.airline_name}</Text>}
              </View>
              <View style={routeStyles.routeRow}>
                <Text style={routeStyles.timeText}>{depTime} {'→'} {arrTime}</Text>
                {durationH !== null && <Text style={routeStyles.durationText}>{durationH}h{String(durationM).padStart(2, '0')}</Text>}
              </View>
              <Text style={routeStyles.daysText}>{daysStr}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const routeStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.primary + '08',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '20',
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  hint: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.sm },
  dateHint: { ...typography.bodySmall, color: colors.warning || colors.textLight, fontStyle: 'italic' },
  searchBtn: {
    backgroundColor: colors.primary + '15',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary + '40',
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  searchBtnText: { ...typography.bodySmall, fontWeight: '600', color: colors.primary },
  loadingText: { ...typography.bodySmall, color: colors.textSecondary, marginLeft: spacing.sm },
  errorText: { ...typography.bodySmall, color: colors.error, marginBottom: spacing.sm },
  retryBtn: { alignSelf: 'flex-start' },
  retryBtnText: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },
  resultHeader: { ...typography.bodySmall, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  routeItem: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flightCode: {
    ...typography.bodySmall, fontWeight: '700', color: colors.primary,
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: borderRadius.sm, overflow: 'hidden',
  },
  airlineName: { ...typography.bodySmall, color: colors.text, flex: 1 },
  timeText: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginTop: 4 },
  durationText: { ...typography.caption, color: colors.textSecondary, marginTop: 4, marginLeft: spacing.sm },
  daysText: { ...typography.caption, color: colors.textLight, marginTop: 2 },
});

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
  searchBtn: {
    backgroundColor: colors.primary + '15',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary + '40',
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  searchBtnText: { ...typography.bodySmall, fontWeight: '600', color: colors.primary },
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
