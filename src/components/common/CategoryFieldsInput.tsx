import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Input } from './Input';
import { DatePickerInput } from './DatePickerInput';
import { TimePickerInput } from './TimePickerInput';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import { PlaceResult } from './PlaceAutocomplete';
import { AirportAutocomplete } from './AirportAutocomplete';
import { Airport, getAirportByIata } from '../../data/airports';
import { CATEGORY_FIELDS, CategoryField, getTransportFields, FlightLeg, getFlightLegs } from '../../utils/categoryFields';
import { suggestHubs } from '../../data/hubs';
import { lookupFlight, isValidFlightNumber, FlightInfo, searchFlightsByRoute, RouteFlightInfo } from '../../utils/flightLookup';
import { getTransitDetails, TransitDetail } from '../../services/directions';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { Icon } from '../../utils/icons';

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
  const hasMultiLegs = isFlightTransport && Array.isArray(data.flight_legs) && data.flight_legs.length >= 2;

  const primaryFields = fields.filter(f => !f.secondary);
  const secondaryFields = fields.filter(f => f.secondary);

  // In multi-leg mode, hide the flat flight fields (handled by FlightLegsEditor)
  const multiLegHiddenKeys = new Set([
    'departure_station', 'arrival_station', 'departure_date', 'reference_number',
    'via_airport', 'via_flight_number', 'carrier', 'departure_time', 'arrival_time', 'arrival_date',
  ]);
  const visiblePrimary = hasMultiLegs
    ? primaryFields.filter(f => !multiLegHiddenKeys.has(f.key))
    : primaryFields;
  const visibleSecondary = hasMultiLegs
    ? secondaryFields.filter(f => !multiLegHiddenKeys.has(f.key))
    : secondaryFields;

  // Auto-expand if any secondary field already has data
  const hasSecondaryData = visibleSecondary.some(f => {
    const val = data[f.key] || data[`${f.key}_name`];
    return val && String(val).trim() !== '';
  });
  const [expanded, setExpanded] = useState(hasSecondaryData);

  // Auto-expand when secondary data appears (e.g. after FlightLookup)
  useEffect(() => {
    if (hasSecondaryData && !expanded) {
      setExpanded(true);
    }
  }, [hasSecondaryData]);

  const { width: screenWidth } = useWindowDimensions();
  const isNarrow = screenWidth < 360;

  const update = (key: string, value: any) => {
    onChange({ ...data, [key]: value });
  };

  /** Render a single field (without pair wrapper) */
  const renderField = (field: CategoryField): React.ReactNode => {
    switch (field.type) {
      case 'text':
        return (
          <Input
            key={field.key}
            label={field.label}
            placeholder={field.placeholder}
            value={data[field.key] || ''}
            onChangeText={(v: string) => update(field.key, v)}
          />
        );
      case 'time':
        return (
          <TimePickerInput
            key={field.key}
            label={field.label}
            value={data[field.key] || ''}
            onChange={(v: string) => update(field.key, v)}
            placeholder={field.placeholder}
          />
        );
      case 'date': {
        const startKey = DATE_PAIRS[field.key];
        const startValue = startKey ? data[startKey] : undefined;
        return (
          <DatePickerInput
            key={field.key}
            label={field.label}
            value={data[field.key] || ''}
            onChange={(v: string) => update(field.key, v)}
            placeholder={field.placeholder}
            initialDate={startValue || tripStartDate || undefined}
            minDate={startValue || tripStartDate || undefined}
            maxDate={tripEndDate || undefined}
          />
        );
      }
      case 'select':
        return (
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
          </View>
        );
      case 'place':
        return (
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
          />
        );
      case 'airport':
        return (
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
          />
        );
      default:
        return null;
    }
  };

  /** Get widgets that should appear after a specific field key */
  const getWidgetsAfterField = (fieldKey: string): React.ReactNode[] => {
    const widgets: React.ReactNode[] = [];

    // Route search widget after arrival_station (only in single-leg / no-leg mode)
    if (fieldKey === 'arrival_station' && isFlightTransport && !hasMultiLegs && data.departure_station && data.arrival_station && !data.reference_number) {
      widgets.push(
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
          onNoResults={() => {
            // Will be handled by hub suggestions inside RouteSearchWidget
          }}
          onSplitWithHub={(hubIata: string, hubName: string) => {
            // Create 2-leg flight_legs from current dep/arr + hub
            const legs: FlightLeg[] = [
              {
                dep_iata: data.departure_station,
                dep_name: data.departure_station_name || data.departure_station,
                arr_iata: hubIata,
                arr_name: hubName,
                dep_date: data.departure_date || undefined,
              },
              {
                dep_iata: hubIata,
                dep_name: hubName,
                arr_iata: data.arrival_station,
                arr_name: data.arrival_station_name || data.arrival_station,
              },
            ];
            onChange({ ...data, flight_legs: legs });
          }}
        />,
      );
    }

    // Transit search widget after arrival_station for Zug/Bus/Fähre
    if (
      fieldKey === 'arrival_station' &&
      category === 'transport' &&
      (data.transport_type === 'Zug' || data.transport_type === 'Bus' || data.transport_type === 'Fähre') &&
      data.departure_station_lat && data.departure_station_lng &&
      data.arrival_station_lat && data.arrival_station_lng
    ) {
      widgets.push(
        <TransitSearchWidget
          key="transit-search"
          origin={{ lat: data.departure_station_lat, lng: data.departure_station_lng }}
          destination={{ lat: data.arrival_station_lat, lng: data.arrival_station_lng }}
          depName={data.departure_station_name || data.departure_station || ''}
          arrName={data.arrival_station_name || data.arrival_station || ''}
          onSelect={(detail) => {
            const updates: Record<string, any> = { ...data };
            if (detail.carrier) updates.carrier = detail.carrier;
            if (detail.lineName) updates.reference_number = detail.lineName;
            if (detail.depTime && detail.depTime !== '?') updates.departure_time = detail.depTime;
            if (detail.arrTime && detail.arrTime !== '?') updates.arrival_time = detail.arrTime;
            onChange(updates);
          }}
        />,
      );
    }

    // Flight lookup widget after reference_number (only in single-leg mode)
    if (fieldKey === 'reference_number' && isFlightTransport && !hasMultiLegs) {
      widgets.push(
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
                updates.departure_time = depParts[1].substring(0, 5);
                if (!data.departure_date && depParts[0]) updates.departure_date = depParts[0];
              } else if (/^\d{2}:\d{2}/.test(depParts[0])) {
                updates.departure_time = depParts[0].substring(0, 5);
              }
            }
            if (flight.arr_time_local) {
              const arrParts = flight.arr_time_local.split(/[T ]/);
              if (arrParts.length >= 2) {
                updates.arrival_date = arrParts[0];
                updates.arrival_time = arrParts[1].substring(0, 5);
              } else if (/^\d{2}:\d{2}/.test(arrParts[0])) {
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

    return widgets;
  };

  /** Render a list of fields with pair grouping and widgets */
  const renderFieldList = (fieldList: CategoryField[]): React.ReactNode[] => {
    const elements: React.ReactNode[] = [];
    let i = 0;
    while (i < fieldList.length) {
      const field = fieldList[i];

      if (field.pair === 'left' && i + 1 < fieldList.length && fieldList[i + 1].pair === 'right') {
        const rightField = fieldList[i + 1];
        // Render pair side-by-side (or stacked if narrow)
        elements.push(
          <View key={`pair-${field.key}-${rightField.key}`} style={isNarrow ? undefined : styles.fieldRow}>
            <View style={isNarrow ? undefined : styles.fieldRowItem}>{renderField(field)}</View>
            <View style={isNarrow ? undefined : styles.fieldRowItem}>{renderField(rightField)}</View>
          </View>,
        );
        // Widgets after each field in the pair
        const leftWidgets = getWidgetsAfterField(field.key);
        const rightWidgets = getWidgetsAfterField(rightField.key);
        elements.push(...leftWidgets, ...rightWidgets);
        i += 2;
      } else {
        // Single field, full width
        elements.push(<React.Fragment key={field.key}>{renderField(field)}</React.Fragment>);
        const widgets = getWidgetsAfterField(field.key);
        elements.push(...widgets);
        i += 1;
      }
    }
    return elements;
  };

  /** Handle FlightLegsEditor updates */
  const handleLegsChange = (legs: FlightLeg[]) => {
    const updates: Record<string, any> = { ...data, flight_legs: legs };
    // Keep top-level dep/arr in sync with first/last leg
    if (legs.length > 0) {
      updates.departure_station = legs[0].dep_iata;
      updates.departure_station_name = legs[0].dep_name;
      updates.arrival_station = legs[legs.length - 1].arr_iata;
      updates.arrival_station_name = legs[legs.length - 1].arr_name;
      // Sync dates/times from first and last legs
      if (legs[0].dep_date) updates.departure_date = legs[0].dep_date;
      if (legs[0].dep_time) updates.departure_time = legs[0].dep_time;
      if (legs[0].flight_number) updates.reference_number = legs[0].flight_number;
      if (legs[0].carrier) updates.carrier = legs[0].carrier;
      const lastLeg = legs[legs.length - 1];
      if (lastLeg.arr_date) updates.arrival_date = lastLeg.arr_date;
      if (lastLeg.arr_time) updates.arrival_time = lastLeg.arr_time;
      if (legs.length >= 2 && legs[1].flight_number) {
        updates.via_flight_number = legs[1].flight_number;
      }
    }
    onChange(updates);
  };

  const handleExitMultiLeg = () => {
    const updates = { ...data };
    delete updates.flight_legs;
    onChange(updates);
  };

  return (
    <View style={styles.container}>
      {renderFieldList(visiblePrimary)}

      {/* Multi-leg flight editor */}
      {hasMultiLegs && (
        <FlightLegsEditor
          legs={data.flight_legs}
          onChange={handleLegsChange}
          onExit={handleExitMultiLeg}
          tripStartDate={tripStartDate}
          tripEndDate={tripEndDate}
        />
      )}

      {/* Manual multi-leg entry point (when in single-leg mode with both airports set) */}
      {isFlightTransport && !hasMultiLegs && data.departure_station && data.arrival_station && (
        <TouchableOpacity
          style={legsStyles.addStopoverBtn}
          onPress={() => {
            const legs: FlightLeg[] = [
              {
                dep_iata: data.departure_station,
                dep_name: data.departure_station_name || data.departure_station,
                arr_iata: data.arrival_station,
                arr_name: data.arrival_station_name || data.arrival_station,
                flight_number: data.reference_number || undefined,
                carrier: data.carrier || undefined,
                dep_date: data.departure_date || undefined,
                dep_time: data.departure_time || undefined,
                arr_date: data.arrival_date || undefined,
                arr_time: data.arrival_time || undefined,
                flight_verified: data.flight_verified || false,
              },
            ];
            // Split into 2 legs with empty via
            const splitLegs: FlightLeg[] = [
              { ...legs[0], arr_iata: '', arr_name: '' },
              { dep_iata: '', dep_name: '', arr_iata: data.arrival_station, arr_name: data.arrival_station_name || data.arrival_station },
            ];
            onChange({ ...data, flight_legs: splitLegs });
          }}
          activeOpacity={0.7}
        >
          <Icon name="git-branch-outline" size={14} color={colors.primary} />
          <Text style={legsStyles.addStopoverText}>+ Zwischenstopp hinzufügen</Text>
        </TouchableOpacity>
      )}

      {visibleSecondary.length > 0 && (
        <>
          <TouchableOpacity
            onPress={() => setExpanded(!expanded)}
            style={styles.expandToggle}
            activeOpacity={0.7}
          >
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
            <Text style={styles.expandText}>
              {expanded ? 'Weniger Details' : 'Mehr Details'}
            </Text>
          </TouchableOpacity>
          {expanded && (
            <View style={styles.secondaryCard}>
              {renderFieldList(visibleSecondary)}
            </View>
          )}
        </>
      )}
    </View>
  );
};

// --- Flight Legs Editor ---

interface FlightLegsEditorProps {
  legs: FlightLeg[];
  onChange: (legs: FlightLeg[]) => void;
  onExit: () => void;
  tripStartDate?: string;
  tripEndDate?: string;
}

const FlightLegsEditor: React.FC<FlightLegsEditorProps> = ({ legs, onChange, onExit, tripStartDate, tripEndDate }) => {
  const shortName = (name: string) => name.replace(/\s*\([A-Z]{3}\)\s*$/, '');

  const updateLeg = (index: number, updates: Partial<FlightLeg>) => {
    const newLegs = [...legs];
    newLegs[index] = { ...newLegs[index], ...updates };
    onChange(newLegs);
  };

  const removeLeg = (index: number) => {
    if (legs.length <= 2) {
      // Removing a leg from 2-leg → go back to single-leg mode
      onExit();
      return;
    }
    const newLegs = [...legs];
    // When removing leg at index, merge: prev leg's arr becomes next leg's dep
    if (index > 0 && index < newLegs.length) {
      // Set previous leg's arrival to this leg's arrival
      newLegs[index - 1] = {
        ...newLegs[index - 1],
        arr_iata: newLegs[index].arr_iata,
        arr_name: newLegs[index].arr_name,
      };
    }
    newLegs.splice(index, 1);
    onChange(newLegs);
  };

  const addLegAfter = (index: number) => {
    const newLegs = [...legs];
    const currentLeg = newLegs[index];
    // Insert new empty leg: current leg's arr → empty → next leg's dep
    const newLeg: FlightLeg = {
      dep_iata: currentLeg.arr_iata,
      dep_name: currentLeg.arr_name,
      arr_iata: newLegs[index + 1]?.dep_iata || '',
      arr_name: newLegs[index + 1]?.dep_name || '',
    };
    // Update current leg's arrival to empty (user needs to pick via airport)
    newLegs[index] = { ...currentLeg, arr_iata: '', arr_name: '' };
    newLegs.splice(index + 1, 0, newLeg);
    onChange(newLegs);
  };

  /** Compute layover between two consecutive legs */
  const getLayover = (prevLeg: FlightLeg, nextLeg: FlightLeg): string | null => {
    if (!prevLeg.arr_time || !nextLeg.dep_time) return null;
    const prevDate = prevLeg.arr_date || prevLeg.dep_date || '';
    const nextDate = nextLeg.dep_date || prevDate;
    if (!prevDate) return null;

    const arrDt = new Date(`${prevDate}T${prevLeg.arr_time}`);
    const depDt = new Date(`${nextDate}T${nextLeg.dep_time}`);
    const diffMin = Math.round((depDt.getTime() - arrDt.getTime()) / 60000);
    if (diffMin <= 0 || isNaN(diffMin)) return null;
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    if (h === 0) return `${m} Min. Umstieg`;
    return `${h}h${m > 0 ? String(m).padStart(2, '0') : ''} Umstieg`;
  };

  return (
    <View style={legsStyles.container}>
      <View style={legsStyles.header}>
        <Text style={legsStyles.title}>Mehrstreckenflug</Text>
        <TouchableOpacity onPress={onExit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="close-circle-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {legs.map((leg, i) => (
        <React.Fragment key={i}>
          <View style={legsStyles.legCard}>
            <View style={legsStyles.legHeader}>
              <Text style={legsStyles.legLabel}>Leg {i + 1}</Text>
              {legs.length > 1 && (
                <TouchableOpacity onPress={() => removeLeg(i)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Icon name="close" size={16} color={colors.error} />
                </TouchableOpacity>
              )}
            </View>

            {/* Airport selectors */}
            <View style={legsStyles.airportRow}>
              <AirportAutocomplete
                label="Von"
                placeholder="Abflughafen"
                value={leg.dep_name || ''}
                onChangeText={(v) => updateLeg(i, { dep_name: v, dep_iata: '' })}
                onSelect={(airport: Airport) => {
                  const updated = {
                    dep_iata: airport.iata,
                    dep_name: `${airport.city} (${airport.iata})`,
                  };
                  updateLeg(i, updated);
                  // Link to previous leg's arrival
                  if (i > 0) {
                    const newLegs = [...legs];
                    newLegs[i] = { ...newLegs[i], ...updated };
                    newLegs[i - 1] = { ...newLegs[i - 1], arr_iata: airport.iata, arr_name: `${airport.city} (${airport.iata})` };
                    onChange(newLegs);
                  }
                }}
              />
              <AirportAutocomplete
                label="Nach"
                placeholder="Zielflughafen"
                value={leg.arr_name || ''}
                onChangeText={(v) => updateLeg(i, { arr_name: v, arr_iata: '' })}
                onSelect={(airport: Airport) => {
                  const updated = {
                    arr_iata: airport.iata,
                    arr_name: `${airport.city} (${airport.iata})`,
                  };
                  updateLeg(i, updated);
                  // Link to next leg's departure
                  if (i < legs.length - 1) {
                    const newLegs = [...legs];
                    newLegs[i] = { ...newLegs[i], ...updated };
                    newLegs[i + 1] = { ...newLegs[i + 1], dep_iata: airport.iata, dep_name: `${airport.city} (${airport.iata})` };
                    onChange(newLegs);
                  }
                }}
              />
            </View>

            {/* Per-leg flight number + date */}
            <View style={legsStyles.legDetails}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Flugnummer"
                  placeholder="z.B. LX1234"
                  value={leg.flight_number || ''}
                  onChangeText={(v) => updateLeg(i, { flight_number: v })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <DatePickerInput
                  label="Datum"
                  value={leg.dep_date || ''}
                  onChange={(v) => updateLeg(i, { dep_date: v })}
                  placeholder="YYYY-MM-DD"
                  initialDate={tripStartDate || undefined}
                  minDate={tripStartDate || undefined}
                  maxDate={tripEndDate || undefined}
                />
              </View>
            </View>

            {/* Per-leg route search */}
            {leg.dep_iata && leg.arr_iata && !leg.flight_number && (
              <LegRouteSearch
                depIata={leg.dep_iata}
                arrIata={leg.arr_iata}
                depName={shortName(leg.dep_name)}
                arrName={shortName(leg.arr_name)}
                departureDate={leg.dep_date}
                onSelect={(route) => {
                  updateLeg(i, {
                    flight_number: route.flight_iata,
                    carrier: route.airline_name || undefined,
                    dep_time: route.dep_time?.substring(0, 5) || undefined,
                    arr_time: route.arr_time?.substring(0, 5) || undefined,
                  });
                }}
              />
            )}

            {/* Per-leg flight lookup */}
            {leg.flight_number && leg.dep_date && (
              <LegFlightLookup
                flightNumber={leg.flight_number}
                flightDate={leg.dep_date}
                onApply={(flight) => {
                  const updates: Partial<FlightLeg> = {};
                  if (flight.airline_name) updates.carrier = flight.airline_name;
                  if (flight.dep_time_local) {
                    const parts = flight.dep_time_local.split(/[T ]/);
                    if (parts.length >= 2) updates.dep_time = parts[1].substring(0, 5);
                  }
                  if (flight.arr_time_local) {
                    const parts = flight.arr_time_local.split(/[T ]/);
                    if (parts.length >= 2) {
                      updates.arr_time = parts[1].substring(0, 5);
                      updates.arr_date = parts[0];
                    }
                  }
                  if (flight.dep_airport && flight.dep_city) {
                    updates.dep_iata = flight.dep_airport;
                    updates.dep_name = `${flight.dep_city} (${flight.dep_airport})`;
                  }
                  if (flight.arr_airport && flight.arr_city) {
                    updates.arr_iata = flight.arr_airport;
                    updates.arr_name = `${flight.arr_city} (${flight.arr_airport})`;
                  }
                  updates.flight_verified = true;
                  if (flight.flight_iata) updates.flight_number = flight.flight_iata;
                  updateLeg(i, updates);
                }}
              />
            )}

            {/* Display times if available */}
            {(leg.dep_time || leg.arr_time || leg.carrier) && (
              <View style={legsStyles.legMeta}>
                {leg.carrier && <Text style={legsStyles.legMetaText}>{leg.carrier}</Text>}
                {leg.dep_time && <Text style={legsStyles.legMetaText}>{leg.dep_time}{leg.arr_time ? ` - ${leg.arr_time}` : ''}</Text>}
                {leg.flight_verified && <Icon name="checkmark-circle" size={14} color={colors.success || '#00B894'} />}
              </View>
            )}
          </View>

          {/* Stopover / layover between legs */}
          {i < legs.length - 1 && (
            <View style={legsStyles.stopover}>
              <View style={legsStyles.stopoverLine} />
              <View style={legsStyles.stopoverBadge}>
                <View style={legsStyles.stopoverDot} />
                <Text style={legsStyles.stopoverText}>
                  {getLayover(leg, legs[i + 1]) || 'Umstieg'}
                </Text>
              </View>
              <View style={legsStyles.stopoverLine} />
            </View>
          )}
        </React.Fragment>
      ))}

      {/* Add more legs */}
      <TouchableOpacity
        style={legsStyles.addLegBtn}
        onPress={() => addLegAfter(legs.length - 2 >= 0 ? legs.length - 2 : 0)}
        activeOpacity={0.7}
      >
        <Icon name="add-circle-outline" size={16} color={colors.primary} />
        <Text style={legsStyles.addLegText}>Weiteren Zwischenstopp</Text>
      </TouchableOpacity>
    </View>
  );
};

// --- Per-Leg Route Search (compact version of RouteSearchWidget) ---

interface LegRouteSearchProps {
  depIata: string;
  arrIata: string;
  depName: string;
  arrName: string;
  departureDate?: string;
  onSelect: (route: RouteFlightInfo) => void;
}

const LegRouteSearch: React.FC<LegRouteSearchProps> = ({ depIata, arrIata, depName, arrName, departureDate, onSelect }) => {
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState<RouteFlightInfo[]>([]);
  const [searched, setSearched] = useState(false);
  const lastRef = useRef('');

  useEffect(() => {
    const key = `${depIata}_${arrIata}_${departureDate || ''}`;
    if (key !== lastRef.current) { setRoutes([]); setSearched(false); }
  }, [depIata, arrIata, departureDate]);

  const doSearch = useCallback(async () => {
    const key = `${depIata}_${arrIata}_${departureDate || ''}`;
    lastRef.current = key;
    setLoading(true);
    try {
      const result = await searchFlightsByRoute(depIata, arrIata);
      if (departureDate) {
        const dayNum = getAirLabsDay(departureDate);
        const filtered = result.filter(r => !r.days || r.days.length === 0 || r.days.includes(dayNum));
        setRoutes(filtered.length > 0 ? filtered : result);
      } else {
        setRoutes(result);
      }
      setSearched(true);
    } catch {
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, [depIata, arrIata, departureDate]);

  if (!searched && !loading) {
    return (
      <TouchableOpacity style={legsStyles.legSearchBtn} onPress={doSearch} activeOpacity={0.7}>
        <Icon name="search-outline" size={14} color={colors.primary} />
        <Text style={legsStyles.legSearchText}>Flüge {depName} {'→'} {arrName}</Text>
      </TouchableOpacity>
    );
  }

  if (loading) return <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: spacing.xs }} />;

  if (routes.length === 0) return null;

  return (
    <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
      {routes.slice(0, 5).map(route => (
        <TouchableOpacity
          key={route.flight_iata}
          style={legsStyles.legRouteItem}
          onPress={() => onSelect(route)}
          activeOpacity={0.6}
        >
          <Text style={legsStyles.legRouteCode}>{route.flight_iata}</Text>
          {route.airline_name && <Text style={legsStyles.legRouteAirline} numberOfLines={1}>{route.airline_name}</Text>}
          <Text style={legsStyles.legRouteTime}>
            {route.dep_time?.substring(0, 5) || '?'} {'→'} {route.arr_time?.substring(0, 5) || '?'}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};

// --- Per-Leg Flight Lookup (compact) ---

interface LegFlightLookupProps {
  flightNumber: string;
  flightDate: string;
  onApply: (flight: FlightInfo) => void;
}

const LegFlightLookup: React.FC<LegFlightLookupProps> = ({ flightNumber, flightDate, onApply }) => {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const lastRef = useRef('');

  const normalized = flightNumber.toUpperCase().replace(/\s/g, '');
  const key = `${normalized}_${flightDate}`;

  useEffect(() => {
    if (key !== lastRef.current) setDone(false);
  }, [key]);

  const doLookup = useCallback(async () => {
    if (!isValidFlightNumber(flightNumber) || !flightDate) return;
    lastRef.current = key;
    setLoading(true);
    try {
      const result = await lookupFlight(normalized, flightDate);
      if (result?.found) onApply(result);
    } catch {}
    setLoading(false);
    setDone(true);
  }, [flightNumber, flightDate, normalized, key, onApply]);

  if (done || !isValidFlightNumber(flightNumber)) return null;

  if (loading) return <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: spacing.xs }} />;

  return (
    <TouchableOpacity style={legsStyles.legSearchBtn} onPress={doLookup} activeOpacity={0.7}>
      <Icon name="airplane-outline" size={14} color={colors.primary} />
      <Text style={legsStyles.legSearchText}>Flugdaten laden</Text>
    </TouchableOpacity>
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

// --- Transit Search Widget (Zug/Bus/Fähre) ---

interface TransitSearchWidgetProps {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  depName: string;
  arrName: string;
  onSelect: (detail: TransitDetail) => void;
}

const TRANSIT_ICONS: Record<string, string> = {
  RAIL: '🚂',
  HIGH_SPEED_TRAIN: '🚂',
  LONG_DISTANCE_TRAIN: '🚂',
  COMMUTER_TRAIN: '🚂',
  SUBWAY: '🚇',
  BUS: '🚌',
  INTERCITY_BUS: '🚌',
  TROLLEYBUS: '🚌',
  FERRY: '⛴',
  TRAM: '🚊',
};

const TransitSearchWidget: React.FC<TransitSearchWidgetProps> = ({
  origin, destination, depName, arrName, onSelect,
}) => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TransitDetail[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const lastSearchRef = useRef('');

  // Reset when coordinates change
  useEffect(() => {
    const key = `${origin.lat}_${origin.lng}_${destination.lat}_${destination.lng}`;
    if (key !== lastSearchRef.current) {
      setResults([]);
      setError(null);
      setSearched(false);
    }
  }, [origin.lat, origin.lng, destination.lat, destination.lng]);

  const doSearch = useCallback(async () => {
    const key = `${origin.lat}_${origin.lng}_${destination.lat}_${destination.lng}`;
    lastSearchRef.current = key;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const details = await getTransitDetails(origin, destination);
      setResults(details);
      setSearched(true);
    } catch {
      setError('Fehler bei der Verbindungssuche');
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, [origin, destination]);

  if (!searched && !loading) {
    return (
      <View style={routeStyles.container}>
        <Text style={routeStyles.hint}>
          ÖV-Verbindungen {depName} {'→'} {arrName} suchen:
        </Text>
        <TouchableOpacity style={routeStyles.searchBtn} onPress={doSearch} activeOpacity={0.7}>
          <Text style={routeStyles.searchBtnText}>ÖV-Verbindungen suchen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={routeStyles.container}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={routeStyles.loadingText}>Verbindungen werden gesucht...</Text>
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

  if (results.length === 0) {
    return (
      <View style={routeStyles.container}>
        <Text style={routeStyles.noDirectText}>Keine ÖV-Verbindungen gefunden</Text>
        <TouchableOpacity style={[routeStyles.retryBtn, { marginTop: spacing.sm }]} onPress={doSearch} activeOpacity={0.7}>
          <Text style={routeStyles.retryBtnText}>Erneut suchen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={routeStyles.container}>
      <Text style={routeStyles.resultHeader}>{results.length} Verbindung{results.length !== 1 ? 'en' : ''} gefunden</Text>
      <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled>
        {results.map((detail, idx) => {
          const icon = TRANSIT_ICONS[detail.transitType] || '🚂';
          const durationH = Math.floor(detail.durationMin / 60);
          const durationM = detail.durationMin % 60;
          const durationStr = durationH > 0
            ? `${durationH}h${String(durationM).padStart(2, '0')}`
            : `${durationM} Min.`;

          return (
            <TouchableOpacity
              key={`${detail.lineName}-${detail.depTime}-${idx}`}
              style={routeStyles.routeItem}
              onPress={() => onSelect(detail)}
              activeOpacity={0.6}
            >
              <View style={routeStyles.routeRow}>
                <Text style={{ fontSize: 16, marginRight: 4 }}>{icon}</Text>
                <Text style={routeStyles.flightCode}>{detail.lineName || detail.transitType}</Text>
                {detail.carrier ? <Text style={routeStyles.airlineName} numberOfLines={1}>{detail.carrier}</Text> : null}
              </View>
              <View style={routeStyles.routeRow}>
                <Text style={routeStyles.timeText}>{detail.depTime} {'→'} {detail.arrTime}</Text>
                <Text style={routeStyles.durationText}>{durationStr}</Text>
              </View>
              {(detail.depStop || detail.arrStop) && (
                <Text style={routeStyles.daysText}>{detail.depStop} {'→'} {detail.arrStop}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

interface RouteSearchWidgetProps {
  depIata: string;
  arrIata: string;
  depCityName: string;
  arrCityName: string;
  departureDate?: string;
  onSelect: (route: RouteFlightInfo) => void;
  onNoResults?: () => void;
  onSplitWithHub?: (hubIata: string, hubName: string) => void;
}

const DAY_NAMES = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Get AirLabs day number (1=Mon..7=Sun) from a YYYY-MM-DD string */
function getAirLabsDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const jsDay = d.getDay(); // 0=Sun..6=Sat
  return String(jsDay === 0 ? 7 : jsDay);
}

const RouteSearchWidget: React.FC<RouteSearchWidgetProps> = ({
  depIata, arrIata, depCityName, arrCityName, departureDate, onSelect, onNoResults, onSplitWithHub,
}) => {
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState<RouteFlightInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [dayHint, setDayHint] = useState<string | null>(null);
  const [noDirectFlights, setNoDirectFlights] = useState(false);
  const lastSearchRef = useRef('');

  // Compute hub suggestions for the dep/arr countries
  const hubSuggestions = useMemo(() => {
    const depAirport = getAirportByIata(depIata);
    const arrAirport = getAirportByIata(arrIata);
    if (!depAirport || !arrAirport) return [];
    const hubs = suggestHubs(depAirport.country, arrAirport.country);
    // Resolve to airport objects, filter out dep/arr themselves
    return hubs
      .filter(h => h !== depIata && h !== arrIata)
      .map(iata => getAirportByIata(iata))
      .filter((a): a is Airport => !!a)
      .slice(0, 5);
  }, [depIata, arrIata]);

  // Reset when airports or date change
  useEffect(() => {
    const key = `${depIata}_${arrIata}_${departureDate || ''}`;
    if (key !== lastSearchRef.current) {
      setRoutes([]);
      setError(null);
      setSearched(false);
      setDayHint(null);
      setNoDirectFlights(false);
    }
  }, [depIata, arrIata, departureDate]);

  const doSearch = useCallback(async () => {
    if (!departureDate) return;
    const key = `${depIata}_${arrIata}_${departureDate}`;
    lastSearchRef.current = key;
    setLoading(true);
    setError(null);
    setRoutes([]);
    setDayHint(null);
    setNoDirectFlights(false);
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
        // No flights on this specific day — show ALL flights with a hint
        setRoutes(result);
        setDayHint(`Keine Direktflüge am ${DAY_NAMES[parseInt(dayNum)]} gefunden — alle Flüge auf dieser Route:`);
      } else {
        setNoDirectFlights(true);
        onNoResults?.();
      }
      setSearched(true);
    } catch {
      setError('Fehler bei der Routensuche');
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, [depIata, arrIata, departureDate, onNoResults]);

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

  // No direct flights → show hub suggestions
  if (noDirectFlights) {
    return (
      <View style={routeStyles.container}>
        <Text style={routeStyles.noDirectText}>Keine Direktflüge gefunden</Text>
        {hubSuggestions.length > 0 && onSplitWithHub && (
          <>
            <Text style={routeStyles.hubHint}>Häufige Umstiegspunkte:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.xs }}>
              {hubSuggestions.map(hub => (
                <TouchableOpacity
                  key={hub.iata}
                  style={routeStyles.hubChip}
                  onPress={() => onSplitWithHub(hub.iata, `${hub.city} (${hub.iata})`)}
                  activeOpacity={0.6}
                >
                  <Text style={routeStyles.hubCode}>{hub.iata}</Text>
                  <Text style={routeStyles.hubCity}>{hub.city}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}
        <TouchableOpacity style={[routeStyles.retryBtn, { marginTop: spacing.sm }]} onPress={doSearch} activeOpacity={0.7}>
          <Text style={routeStyles.retryBtnText}>Erneut suchen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={routeStyles.container}>
      {dayHint && <Text style={routeStyles.dayHintText}>{dayHint}</Text>}
      <Text style={routeStyles.resultHeader}>{routes.length} Direktflüge gefunden</Text>
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

// --- Styles ---

const legsStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.primary + '08',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '25',
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
  },
  legCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  legHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  legLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  airportRow: {
    gap: spacing.xs,
  },
  legDetails: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  legMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  legMetaText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  stopover: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  stopoverLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  stopoverBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  stopoverDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.warning || '#F0AD4E',
  },
  stopoverText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  addLegBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  addLegText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
  addStopoverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  addStopoverText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
  legSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary + '10',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  legSearchText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  legRouteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 1,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  legRouteCode: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  legRouteAirline: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  legRouteTime: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text,
  },
});

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
  dayHintText: { ...typography.bodySmall, color: colors.warning || '#F0AD4E', fontStyle: 'italic', marginBottom: spacing.sm },
  // Hub suggestions
  noDirectText: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  hubHint: { ...typography.caption, color: colors.textSecondary },
  hubChip: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary + '40',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    marginRight: spacing.sm,
    alignItems: 'center',
  },
  hubCode: { ...typography.bodySmall, fontWeight: '700', color: colors.primary },
  hubCity: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
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
  expandToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  expandText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
  secondaryCard: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fieldRowItem: {
    flex: 1,
  },
});
