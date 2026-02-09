import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { clearTripData, ClearTripOptions } from '../../api/trips';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';

interface Props {
  visible: boolean;
  tripId: string;
  onClose: () => void;
  onCleared: () => void;
}

interface ClearOption {
  key: keyof ClearTripOptions;
  label: string;
  icon: string;
  description: string;
}

const OPTIONS: ClearOption[] = [
  { key: 'activities', label: 'Aktivitäten & Tage', icon: '📋', description: 'Alle Tagesplaene und Aktivitaeten' },
  { key: 'stops', label: 'Stops', icon: '📍', description: 'Alle Reise-Stops' },
  { key: 'budget', label: 'Budget & Ausgaben', icon: '💰', description: 'Kategorien und erfasste Ausgaben' },
  { key: 'packing', label: 'Checkliste', icon: '✅', description: 'Alle Packlisten und Eintraege' },
  { key: 'photos', label: 'Fotos', icon: '📸', description: 'Alle hochgeladenen Fotos' },
];

export const ClearTripModal: React.FC<Props> = ({ visible, tripId, onClose, onCleared }) => {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [clearing, setClearing] = useState(false);

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const toggleOption = (key: string) => {
    setSelected(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAll = () => {
    const allSelected = selectedCount === OPTIONS.length;
    const next: Record<string, boolean> = {};
    OPTIONS.forEach(o => { next[o.key] = !allSelected; });
    setSelected(next);
  };

  const handleClear = async () => {
    if (selectedCount === 0) return;
    setClearing(true);
    try {
      const options: ClearTripOptions = {
        activities: !!selected.activities,
        stops: !!selected.stops,
        budget: !!selected.budget,
        packing: !!selected.packing,
        photos: !!selected.photos,
      };
      await clearTripData(tripId, options);
      onCleared();
    } catch (e) {
      console.error('Clear trip data failed:', e);
    } finally {
      setClearing(false);
    }
  };

  const handleClose = () => {
    if (clearing) return;
    setSelected({});
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose}>
        <TouchableOpacity style={styles.modal} activeOpacity={1} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>Reise leeren</Text>
          <Text style={styles.subtitle}>Wähle aus, welche Daten gelöscht werden sollen. Stammdaten (Name, Ziel, Reisedaten) bleiben erhalten.</Text>

          <TouchableOpacity style={styles.selectAllRow} onPress={selectAll} activeOpacity={0.7}>
            <View style={[styles.checkbox, selectedCount === OPTIONS.length && styles.checkboxChecked]}>
              {selectedCount === OPTIONS.length && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.selectAllText}>Alle auswählen</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          {OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={styles.optionRow}
              onPress={() => toggleOption(opt.key)}
              activeOpacity={0.7}
              disabled={clearing}
            >
              <View style={[styles.checkbox, selected[opt.key] && styles.checkboxChecked]}>
                {selected[opt.key] && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.optionIcon}>{opt.icon}</Text>
              <View style={styles.optionText}>
                <Text style={styles.optionLabel}>{opt.label}</Text>
                <Text style={styles.optionDesc}>{opt.description}</Text>
              </View>
            </TouchableOpacity>
          ))}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} disabled={clearing}>
              <Text style={styles.cancelText}>Abbrechen</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deleteBtn, selectedCount === 0 && styles.deleteBtnDisabled]}
              onPress={handleClear}
              disabled={selectedCount === 0 || clearing}
              activeOpacity={0.7}
            >
              {clearing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.deleteText}>
                  {selectedCount === 0 ? 'Löschen' : `${selectedCount} ${selectedCount === 1 ? 'Bereich' : 'Bereiche'} löschen`}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '90%',
    maxWidth: 440,
    maxHeight: '85%',
    ...shadows.lg,
  },
  title: { ...typography.h2, marginBottom: spacing.xs },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  selectAllText: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.xs },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  checkboxChecked: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  checkmark: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  optionIcon: { fontSize: 20, marginRight: spacing.sm, width: 28 },
  optionText: { flex: 1 },
  optionLabel: { ...typography.body, fontWeight: '600' },
  optionDesc: { ...typography.caption, color: colors.textLight },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  cancelText: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  deleteBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    backgroundColor: colors.error,
  },
  deleteBtnDisabled: { opacity: 0.4 },
  deleteText: { ...typography.bodySmall, fontWeight: '600', color: '#FFFFFF' },
});
