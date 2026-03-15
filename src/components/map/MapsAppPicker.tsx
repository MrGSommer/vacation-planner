import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Platform } from 'react-native';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { Icon } from '../../utils/icons';
import { openInMaps, type MapsProvider } from '../../utils/openInMaps';

const PREF_KEY = 'preferred_maps_app';

function getPreferredApp(): MapsProvider | null {
  if (Platform.OS !== 'web') return null;
  try {
    return localStorage.getItem(PREF_KEY) as MapsProvider | null;
  } catch {
    return null;
  }
}

function setPreferredApp(provider: MapsProvider | null): void {
  if (Platform.OS !== 'web') return;
  try {
    if (provider) localStorage.setItem(PREF_KEY, provider);
    else localStorage.removeItem(PREF_KEY);
  } catch {}
}

interface Props {
  visible: boolean;
  lat: number;
  lng: number;
  label?: string;
  locationContext?: string;
  onClose: () => void;
}

export const MapsAppPicker: React.FC<Props> = ({ visible, lat, lng, label, locationContext, onClose }) => {
  const [alwaysUse, setAlwaysUse] = useState(false);
  const isAndroid = Platform.OS === 'android';

  const handleSelect = (provider: MapsProvider) => {
    if (alwaysUse) setPreferredApp(provider);
    openInMaps(lat, lng, label, locationContext, provider);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
          <Text style={styles.title}>Route planen</Text>
          <Text style={styles.subtitle}>Wohin möchtest du navigieren?</Text>

          {/* Google Maps option */}
          <TouchableOpacity style={styles.option} onPress={() => handleSelect('google')}>
            <View style={styles.optionIcon}>
              <Text style={styles.optionEmoji}>🗺️</Text>
            </View>
            <View style={styles.optionContent}>
              <Text style={styles.optionTitle}>Google Maps</Text>
              <Text style={styles.optionSub}>Navigation starten</Text>
            </View>
            <Icon name="chevron-forward" size={20} color={colors.textLight} />
          </TouchableOpacity>

          {/* Apple Maps option (not on Android) */}
          {!isAndroid && (
            <TouchableOpacity style={styles.option} onPress={() => handleSelect('apple')}>
              <View style={styles.optionIcon}>
                <Text style={styles.optionEmoji}>🍎</Text>
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Apple Maps</Text>
                <Text style={styles.optionSub}>Navigation starten</Text>
              </View>
              <Icon name="chevron-forward" size={20} color={colors.textLight} />
            </TouchableOpacity>
          )}

          {/* Always use toggle */}
          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => setAlwaysUse(!alwaysUse)}
          >
            <Icon
              name={alwaysUse ? 'checkbox' : 'square-outline'}
              size={22}
              color={alwaysUse ? colors.primary : colors.textLight}
            />
            <Text style={styles.toggleText}>Immer diese App verwenden</Text>
          </TouchableOpacity>

          {/* Cancel */}
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Abbrechen</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

/**
 * Opens maps — either directly (if preference is saved) or via the picker.
 * Returns true if opened directly, false if picker should be shown.
 */
export function tryOpenMapsDirectly(
  lat: number, lng: number, label?: string, locationContext?: string
): boolean {
  const pref = getPreferredApp();
  if (pref) {
    openInMaps(lat, lng, label, locationContext, pref);
    return true;
  }
  return false;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  title: {
    ...typography.h2,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    ...shadows.sm,
  },
  optionEmoji: { fontSize: 22 },
  optionContent: { flex: 1 },
  optionTitle: { ...typography.body, fontWeight: '600' },
  optionSub: { ...typography.caption, color: colors.textSecondary },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  toggleText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  cancelText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
