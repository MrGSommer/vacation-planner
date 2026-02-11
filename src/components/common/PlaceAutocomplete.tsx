import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, TextInput, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export interface PlaceResult {
  name: string;
  place_id: string;
  address: string;
  lat: number;
  lng: number;
  opening_hours?: string;
  website?: string;
  types?: string[];
}

interface Props {
  label?: string;
  placeholder?: string;
  value?: string;
  onSelect: (place: PlaceResult) => void;
  onChangeText?: (text: string) => void;
}

let mapsLoading: Promise<void> | null = null;

const ensureGoogleMaps = (): Promise<void> => {
  if (Platform.OS !== 'web') return Promise.resolve();
  if (mapsLoading) return mapsLoading;
  mapsLoading = new Promise<void>((resolve, reject) => {
    const waitForApi = () => {
      if ((window as any).google?.maps?.importLibrary) { resolve(); return; }
      setTimeout(waitForApi, 50);
    };
    if ((window as any).google?.maps?.importLibrary) { resolve(); return; }
    const existing = document.getElementById('google-maps-script');
    if (existing) { waitForApi(); return; }
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places,marker&loading=async`;
    script.async = true;
    script.onload = () => waitForApi();
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });
  return mapsLoading;
};

/** Import a Google Maps library, waiting for the core script first. */
export const importMapsLibrary = async (lib: string): Promise<any> => {
  await ensureGoogleMaps();
  if (google.maps.importLibrary) return google.maps.importLibrary(lib);
  return (google.maps as any)[lib] || google.maps;
};

export const PlaceAutocomplete: React.FC<Props> = ({ label, placeholder, value, onSelect, onChangeText }) => {
  const [query, setQuery] = useState(value || '');
  const [predictions, setPredictions] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [focused, setFocused] = useState(false);
  const [rect, setRect] = useState({ top: 0, left: 0, width: 0 });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const selectingRef = useRef(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value !== undefined && value !== query) setQuery(value);
  }, [value]);

  const measure = useCallback(() => {
    if (Platform.OS !== 'web' || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  const search = useCallback(async (text: string) => {
    if (!text.trim() || text.length < 3) { setPredictions([]); setShowDropdown(false); return; }
    try {
      const lib = await importMapsLibrary('places');
      const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: text, language: 'de',
      });
      const mapped = suggestions.filter((s: any) => s.placePrediction).map((s: any) => s.placePrediction);
      setPredictions(mapped);
      if (mapped.length > 0) { measure(); setShowDropdown(true); }
      else setShowDropdown(false);
    } catch { setPredictions([]); }
  }, [measure]);

  const handleChange = (text: string) => {
    setQuery(text);
    onChangeText?.(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(text), 300);
  };

  const handleSelect = async (prediction: any) => {
    selectingRef.current = true;
    setShowDropdown(false);
    const name = prediction.text?.text || prediction.mainText?.text || '';
    setQuery(name);
    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'regularOpeningHours', 'websiteURI', 'types'] });
      const loc = place.location;
      if (loc) {
        onSelect({
          name: place.displayName || prediction.mainText?.text || '',
          place_id: prediction.placeId,
          address: place.formattedAddress || prediction.text?.text || '',
          lat: loc.lat(), lng: loc.lng(),
          opening_hours: place.regularOpeningHours?.weekdayDescriptions?.join('\n'),
          website: place.websiteURI || undefined,
          types: place.types || undefined,
        });
      }
    } catch {
      onSelect({ name, place_id: prediction.placeId, address: prediction.text?.text || '', lat: 0, lng: 0 });
    }
  };

  const handleFocus = () => { setFocused(true); if (predictions.length) { measure(); setShowDropdown(true); } };
  const handleBlur = () => { setFocused(false); setTimeout(() => { if (!selectingRef.current) setShowDropdown(false); selectingRef.current = false; }, 200); };
  const handleClear = () => { setQuery(''); setPredictions([]); setShowDropdown(false); onChangeText?.(''); };

  /* ── Web dropdown ── */
  const webDropdown = showDropdown && predictions.length > 0 && rect.width > 0 ? (
    <div
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: 'fixed', top: rect.top, left: rect.left, width: rect.width,
        zIndex: 99999, background: colors.card,
        borderRadius: borderRadius.md, border: `1px solid ${colors.border}`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
        maxHeight: 280, overflowY: 'auto',
        scrollbarWidth: 'thin' as any, scrollbarColor: `${colors.border} transparent`,
      }}
    >
      {predictions.map((item, i) => (
        <div
          key={item.placeId}
          onClick={() => handleSelect(item)}
          style={{
            display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12,
            padding: `10px ${spacing.md}px`, cursor: 'pointer',
            borderBottom: i < predictions.length - 1 ? `1px solid ${colors.border}` : 'none',
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.background; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 15, fontWeight: 500, color: colors.text,
              whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {item.mainText?.text || item.text?.text || ''}
            </div>
            {item.secondaryText?.text && (
              <div style={{
                fontSize: 12, color: colors.textLight, marginTop: 1,
                whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {item.secondaryText.text}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  ) : null;

  /* ── Native dropdown ── */
  const nativeDropdown = showDropdown && predictions.length > 0 ? (
    <View style={nStyles.dropdown}>
      <ScrollView keyboardShouldPersistTaps="always" nestedScrollEnabled style={{ maxHeight: 248 }}>
        {predictions.map((item, i) => (
          <TouchableOpacity
            key={item.placeId}
            style={[nStyles.item, i === predictions.length - 1 && { borderBottomWidth: 0 }]}
            onPressIn={() => { selectingRef.current = true; }}
            onPress={() => handleSelect(item)}
            activeOpacity={0.6}
          >
            <View style={{ flex: 1 }}>
              <Text style={nStyles.mainText} numberOfLines={1}>
                {item.mainText?.text || item.text?.text || ''}
              </Text>
              {item.secondaryText?.text ? (
                <Text style={nStyles.subText} numberOfLines={1}>{item.secondaryText.text}</Text>
              ) : null}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      {/* Invisible anchor wraps the input — guaranteed DOM element for measuring position */}
      {Platform.OS === 'web' ? (
        <div ref={anchorRef}>
          <View style={[styles.inputBox, focused && styles.inputBoxFocused]}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={handleChange}
              placeholder={placeholder || 'Ort suchen...'}
              placeholderTextColor={colors.textLight}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.clearIcon}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </div>
      ) : (
        <View style={[styles.inputBox, focused && styles.inputBoxFocused]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={handleChange}
            placeholder={placeholder || 'Ort suchen...'}
            placeholderTextColor={colors.textLight}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {Platform.OS === 'web' ? webDropdown : nativeDropdown}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md, zIndex: 10 },
  label: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: borderRadius.md, backgroundColor: colors.card,
    paddingHorizontal: spacing.sm + 4, height: 48,
  },
  inputBoxFocused: { borderColor: colors.primary },
  searchIcon: { fontSize: 14, marginRight: spacing.sm, opacity: 0.45 },
  input: { flex: 1, height: 48, ...typography.body, color: colors.text, outlineStyle: 'none' as any },
  clearIcon: { fontSize: 13, color: colors.textLight, padding: spacing.xs },
});

const nStyles = StyleSheet.create({
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
    backgroundColor: colors.card, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border, ...shadows.lg,
    ...(Platform.OS === 'web' ? { zIndex: 1000 } : { elevation: 10 }),
    maxHeight: 250, overflow: 'hidden',
  },
  item: {
    paddingHorizontal: spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  mainText: { fontSize: 15, fontWeight: '500', color: colors.text },
  subText: { fontSize: 12, color: colors.textLight, marginTop: 2 },
});
