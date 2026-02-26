import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, TextInput, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { searchAirports, Airport } from '../../data/airports';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';

interface Props {
  label?: string;
  placeholder?: string;
  value?: string;
  onSelect: (airport: Airport) => void;
  onChangeText?: (text: string) => void;
}

export const AirportAutocomplete: React.FC<Props> = ({ label, placeholder, value, onSelect, onChangeText }) => {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState<Airport[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [focused, setFocused] = useState(false);
  const selectingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (value !== undefined && value !== query) setQuery(value);
  }, [value]);

  const search = useCallback((text: string) => {
    if (!text.trim() || text.length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    const matches = searchAirports(text, 6);
    setResults(matches);
    setShowDropdown(matches.length > 0);
  }, []);

  const handleChange = (text: string) => {
    setQuery(text);
    onChangeText?.(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(text), 150);
  };

  const handleSelect = (airport: Airport) => {
    selectingRef.current = true;
    setShowDropdown(false);
    const display = `${airport.city} (${airport.iata})`;
    setQuery(display);
    onSelect(airport);
  };

  const handleFocus = () => { setFocused(true); if (results.length) setShowDropdown(true); };
  const handleBlur = () => { setFocused(false); setTimeout(() => { if (!selectingRef.current) setShowDropdown(false); selectingRef.current = false; }, 200); };
  const handleClear = () => { setQuery(''); setResults([]); setShowDropdown(false); onChangeText?.(''); };

  const renderWebDropdown = () => {
    if (!showDropdown || !results.length) return null;
    return (
      <div
        onMouseDown={(e) => e.preventDefault()}
        style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          zIndex: 99999, background: colors.card,
          borderRadius: borderRadius.md, border: `1px solid ${colors.border}`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
          maxHeight: 280, overflowY: 'auto',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          scrollbarWidth: 'thin' as any, scrollbarColor: `${colors.border} transparent`,
        }}
      >
        {results.map((airport, i) => (
          <div
            key={airport.iata}
            onClick={() => handleSelect(airport)}
            style={{
              display: 'flex', flexDirection: 'row', alignItems: 'center',
              padding: `10px ${spacing.md}px`, cursor: 'pointer',
              borderBottom: i < results.length - 1 ? `1px solid ${colors.border}` : 'none',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.background; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <span style={{
                fontSize: 13, fontWeight: 700, color: colors.primary,
                backgroundColor: colors.primary + '15',
                padding: '2px 6px', borderRadius: 4,
                fontFamily: 'monospace', letterSpacing: 1,
              }}>{airport.iata}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: colors.text, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {airport.city}
                </div>
                <div style={{ fontSize: 12, color: colors.textLight, marginTop: 1, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {airport.name}, {airport.country}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderNativeDropdown = () => {
    if (!showDropdown || !results.length) return null;
    return (
      <View style={nativeStyles.dropdown}>
        <ScrollView keyboardShouldPersistTaps="always" nestedScrollEnabled style={{ maxHeight: 248 }}>
          {results.map((airport, i) => (
            <TouchableOpacity
              key={airport.iata}
              style={[nativeStyles.item, i === results.length - 1 && { borderBottomWidth: 0 }]}
              onPressIn={() => { selectingRef.current = true; }}
              onPress={() => handleSelect(airport)}
              activeOpacity={0.6}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Text style={dropStyles.iataCode}>{airport.iata}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={dropStyles.mainText} numberOfLines={1}>{airport.city}</Text>
                  <Text style={dropStyles.subText} numberOfLines={1}>{airport.name}, {airport.country}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={[styles.container, showDropdown && { zIndex: 9999 }]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputBox, focused && styles.inputBoxFocused]}>
        <Text style={styles.icon}>{'✈'}</Text>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={handleChange}
          placeholder={placeholder || 'Flughafen suchen...'}
          placeholderTextColor={colors.textLight}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.clearIcon}>{'✕'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {Platform.OS === 'web' ? renderWebDropdown() : renderNativeDropdown()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md, position: 'relative' },
  label: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: borderRadius.md, backgroundColor: colors.card,
    paddingHorizontal: spacing.sm + 4, height: 48,
  },
  inputBoxFocused: { borderColor: colors.primary },
  icon: { fontSize: 14, marginRight: spacing.sm, opacity: 0.45 },
  input: { flex: 1, height: 48, ...typography.body, color: colors.text, outlineStyle: 'none' as any },
  clearIcon: { fontSize: 13, color: colors.textLight, padding: spacing.xs },
});

const dropStyles = StyleSheet.create({
  iataCode: {
    fontSize: 13, fontWeight: '700', color: colors.primary,
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, overflow: 'hidden',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    letterSpacing: 1,
  },
  mainText: { fontSize: 15, fontWeight: '500', color: colors.text },
  subText: { fontSize: 12, color: colors.textLight, marginTop: 1 },
});

const nativeStyles = StyleSheet.create({
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
    backgroundColor: colors.card, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border,
    ...shadows.lg,
    ...(Platform.OS === 'web' ? { zIndex: 1000 } : { elevation: 10 }),
    maxHeight: 250, overflow: 'hidden',
  },
  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
});
