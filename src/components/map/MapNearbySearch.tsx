import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';

export interface NearbyChip {
  id: string;
  label: string;
  icon: string;
  types: string[];
}

const NEARBY_CHIPS: NearbyChip[] = [
  { id: 'restaurant', label: 'Restaurants', icon: '🍽️', types: ['restaurant'] },
  { id: 'sightseeing', label: 'Sehenswürdigkeiten', icon: '🏛️', types: ['tourist_attraction', 'museum'] },
  { id: 'hotel', label: 'Hotels', icon: '🏨', types: ['lodging'] },
  { id: 'cafe', label: 'Cafés', icon: '☕', types: ['cafe'] },
  { id: 'shopping', label: 'Shopping', icon: '🛍️', types: ['shopping_mall', 'store'] },
];

interface Props {
  onSearch: (types: string[], chipId: string) => void;
  onClear: () => void;
  activeChipId: string | null;
  resultCount: number;
}

export const MapNearbySearch: React.FC<Props> = ({ onSearch, onClear, activeChipId, resultCount }) => {
  const lastSearchTime = useRef(0);

  const handleChipPress = useCallback((chip: NearbyChip) => {
    // Rate limit: max 1 request per 5 seconds
    const now = Date.now();
    if (now - lastSearchTime.current < 5000) return;
    lastSearchTime.current = now;

    if (activeChipId === chip.id) {
      onClear();
    } else {
      onSearch(chip.types, chip.id);
    }
  }, [activeChipId, onSearch, onClear]);

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {NEARBY_CHIPS.map(chip => (
          <TouchableOpacity
            key={chip.id}
            style={[styles.chip, activeChipId === chip.id && styles.chipActive]}
            onPress={() => handleChipPress(chip)}
          >
            <Text style={styles.chipIcon}>{chip.icon}</Text>
            <Text style={[styles.chipLabel, activeChipId === chip.id && styles.chipLabelActive]}>
              {chip.label}
            </Text>
          </TouchableOpacity>
        ))}
        {activeChipId && (
          <TouchableOpacity style={styles.clearChip} onPress={onClear}>
            <Text style={styles.clearText}>✕ Entfernen</Text>
            {resultCount > 0 && <Text style={styles.countBadge}>{resultCount}</Text>}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 128,
    left: 0,
    right: 0,
    zIndex: 999,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  chipActive: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  chipIcon: { fontSize: 14, marginRight: 4 },
  chipLabel: { ...typography.caption, fontWeight: '600', color: colors.text },
  chipLabelActive: { color: colors.primary },
  clearChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error + '15',
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.error + '40',
    gap: 6,
  },
  clearText: { ...typography.caption, fontWeight: '600', color: colors.error },
  countBadge: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.error,
    backgroundColor: colors.error + '20',
    paddingHorizontal: 6,
    borderRadius: 10,
    overflow: 'hidden',
  },
});
