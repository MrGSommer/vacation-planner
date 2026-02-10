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
      // Wait until importLibrary is available (needed for loading=async)
      if ((window as any).google?.maps?.importLibrary) { resolve(); return; }
      setTimeout(waitForApi, 50);
    };
    if ((window as any).google?.maps?.importLibrary) { resolve(); return; }
    const existing = document.getElementById('google-maps-script');
    if (existing) {
      waitForApi();
      return;
    }
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
  // google.maps.importLibrary is the new async way to load libraries
  if (google.maps.importLibrary) {
    return google.maps.importLibrary(lib);
  }
  // Fallback for older API versions
  return (google.maps as any)[lib] || google.maps;
};

export const PlaceAutocomplete: React.FC<Props> = ({ label, placeholder, value, onSelect, onChangeText }) => {
  const [query, setQuery] = useState(value || '');
  const [predictions, setPredictions] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dropdownRect, setDropdownRect] = useState({ top: 0, left: 0, width: 0 });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const selectingRef = useRef(false);
  const inputContainerRef = useRef<View>(null);

  useEffect(() => {
    if (value !== undefined && value !== query) setQuery(value);
  }, [value]);

  // Measure input position for fixed dropdown on web
  const measureInput = useCallback(() => {
    if (Platform.OS !== 'web' || !inputContainerRef.current) return;
    try {
      const node = inputContainerRef.current as any;
      // In React Native Web, the ref is the DOM element or has a _nativeTag
      const domNode: HTMLElement | null =
        node instanceof HTMLElement ? node :
        node._nativeTag ? document.getElementById(String(node._nativeTag)) :
        null;
      if (domNode?.getBoundingClientRect) {
        const rect = domNode.getBoundingClientRect();
        setDropdownRect({ top: rect.bottom + 2, left: rect.left, width: rect.width });
      }
    } catch { /* measurement failed, dropdown still works with fallback */ }
  }, []);

  const search = useCallback(async (text: string) => {
    if (!text.trim() || text.length < 3) {
      setPredictions([]);
      return;
    }
    try {
      const placesLib = await importMapsLibrary('places');
      const { suggestions } = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: text,
        language: 'de',
      });
      const mapped = suggestions
        .filter((s: any) => s.placePrediction)
        .map((s: any) => s.placePrediction);
      setPredictions(mapped);
      if (mapped.length > 0) {
        measureInput();
        setShowDropdown(true);
      } else {
        setShowDropdown(false);
      }
    } catch {
      setPredictions([]);
    }
  }, [measureInput]);

  const handleChange = (text: string) => {
    setQuery(text);
    onChangeText?.(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(text), 300);
  };

  const handleSelect = async (prediction: any) => {
    selectingRef.current = true;
    setShowDropdown(false);
    setQuery(prediction.text?.text || prediction.mainText?.text || '');

    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'regularOpeningHours', 'websiteURI', 'types'] });
      const loc = place.location;
      if (loc) {
        let opening_hours: string | undefined;
        if (place.regularOpeningHours?.weekdayDescriptions) {
          opening_hours = place.regularOpeningHours.weekdayDescriptions.join('\n');
        }
        onSelect({
          name: place.displayName || prediction.mainText?.text || '',
          place_id: prediction.placeId,
          address: place.formattedAddress || prediction.text?.text || '',
          lat: loc.lat(),
          lng: loc.lng(),
          opening_hours,
          website: place.websiteURI || undefined,
          types: place.types || undefined,
        });
      }
    } catch {
      onSelect({
        name: prediction.mainText?.text || prediction.text?.text || '',
        place_id: prediction.placeId,
        address: prediction.text?.text || '',
        lat: 0,
        lng: 0,
      });
    }
  };

  const handleFocus = () => {
    setFocused(true);
    if (predictions.length) {
      measureInput();
      setShowDropdown(true);
    }
  };

  const handleBlur = () => {
    setFocused(false);
    setTimeout(() => {
      if (!selectingRef.current) setShowDropdown(false);
      selectingRef.current = false;
    }, 300);
  };

  const renderWebDropdown = () => {
    if (!showDropdown || predictions.length === 0) return null;
    return (
      <div
        style={{
          position: 'fixed',
          top: dropdownRect.top,
          left: dropdownRect.left,
          width: dropdownRect.width || undefined,
          backgroundColor: colors.card,
          borderRadius: borderRadius.md,
          border: `1px solid ${colors.border}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 99999,
          maxHeight: 250,
          overflowY: 'auto' as const,
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {predictions.map((item) => (
          <div
            key={item.placeId}
            style={{
              padding: `${spacing.sm}px ${spacing.md}px`,
              borderBottom: `1px solid ${colors.border}`,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.background; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
            onClick={() => handleSelect(item)}
          >
            <Text style={styles.dropdownMain}>
              {item.mainText?.text || item.text?.text || ''}
            </Text>
            <Text style={styles.dropdownSecondary} numberOfLines={1}>
              {item.secondaryText?.text || ''}
            </Text>
          </div>
        ))}
      </div>
    );
  };

  const renderNativeDropdown = () => {
    if (!showDropdown || predictions.length === 0) return null;
    return (
      <View style={styles.dropdown}>
        <ScrollView keyboardShouldPersistTaps="always" nestedScrollEnabled style={styles.dropdownScroll}>
          {predictions.map((item) => (
            <TouchableOpacity
              key={item.placeId}
              style={styles.dropdownItem}
              onPressIn={() => { selectingRef.current = true; }}
              onPress={() => handleSelect(item)}
            >
              <Text style={styles.dropdownMain}>
                {item.mainText?.text || item.text?.text || ''}
              </Text>
              <Text style={styles.dropdownSecondary} numberOfLines={1}>
                {item.secondaryText?.text || ''}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View ref={inputContainerRef} style={[styles.inputContainer, focused && styles.focused]}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={handleChange}
          placeholder={placeholder || 'Ort suchen...'}
          placeholderTextColor={colors.textLight}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </View>
      {Platform.OS === 'web' ? renderWebDropdown() : renderNativeDropdown()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md, zIndex: 10 },
  label: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  inputContainer: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
  },
  focused: { borderColor: colors.primary },
  input: { height: 48, ...typography.body, color: colors.text, outlineStyle: 'none' as any },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
    ...(Platform.OS === 'web' ? { zIndex: 1000 } : { elevation: 10 }),
    maxHeight: 250,
    overflow: 'hidden',
  },
  dropdownScroll: {
    maxHeight: 248,
  },
  dropdownItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownMain: { ...typography.body, fontWeight: '500' },
  dropdownSecondary: { ...typography.caption, marginTop: 2 },
});
