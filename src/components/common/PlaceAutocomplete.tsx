import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, TextInput, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export interface PlaceResult {
  name: string;
  place_id: string;
  address: string;
  lat: number;
  lng: number;
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
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const autocompleteServiceRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    (async () => {
      try {
        const placesLib = await importMapsLibrary('places');
        autocompleteServiceRef.current = new placesLib.AutocompleteService();
      } catch (e) {
        console.error('Places init error:', e);
      }
    })();
  }, []);

  useEffect(() => {
    if (value !== undefined && value !== query) setQuery(value);
  }, [value]);

  const search = useCallback((text: string) => {
    if (!text.trim() || !autocompleteServiceRef.current) {
      setPredictions([]);
      return;
    }
    autocompleteServiceRef.current.getPlacePredictions(
      { input: text, language: 'de' },
      (results: any, status: string) => {
        if (status === 'OK' && results) {
          setPredictions(results);
          setShowDropdown(true);
        } else {
          setPredictions([]);
        }
      }
    );
  }, []);

  const handleChange = (text: string) => {
    setQuery(text);
    onChangeText?.(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(text), 300);
  };

  const handleSelect = async (prediction: any) => {
    setShowDropdown(false);
    setQuery(prediction.description);

    try {
      const placesLib = await importMapsLibrary('places');
      const place = new placesLib.Place({ id: prediction.place_id });
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
      const loc = place.location;
      if (loc) {
        onSelect({
          name: place.displayName || prediction.structured_formatting?.main_text || prediction.description,
          place_id: prediction.place_id,
          address: place.formattedAddress || prediction.description,
          lat: loc.lat(),
          lng: loc.lng(),
        });
      }
    } catch {
      onSelect({
        name: prediction.structured_formatting?.main_text || prediction.description,
        place_id: prediction.place_id,
        address: prediction.description,
        lat: 0,
        lng: 0,
      });
    }
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputContainer, focused && styles.focused]}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={handleChange}
          placeholder={placeholder || 'Ort suchen...'}
          placeholderTextColor={colors.textLight}
          onFocus={() => { setFocused(true); if (predictions.length) setShowDropdown(true); }}
          onBlur={() => { setFocused(false); setTimeout(() => setShowDropdown(false), 200); }}
        />
      </View>
      {showDropdown && predictions.length > 0 && (
        <View style={styles.dropdown}>
          {predictions.map((item) => (
            <TouchableOpacity
              key={item.place_id}
              style={styles.dropdownItem}
              onPress={() => handleSelect(item)}
            >
              <Text style={styles.dropdownMain}>
                {item.structured_formatting?.main_text || item.description}
              </Text>
              <Text style={styles.dropdownSecondary} numberOfLines={1}>
                {item.structured_formatting?.secondary_text || ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
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
  input: { height: 48, ...typography.body, color: colors.text },
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
    maxHeight: 200,
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
