import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import * as ExpoDocumentPicker from 'expo-document-picker';
import { parseGeoFile, ImportedPlace } from '../../utils/geoImport';
import { Button } from './Button';
import { useToast } from '../../contexts/ToastContext';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onImport: (places: ImportedPlace[]) => Promise<void>;
  dayDates?: string[];
}

export const ImportPlacesModal: React.FC<Props> = ({ visible, onClose, onImport, dayDates }) => {
  const { showToast } = useToast();
  const [places, setPlaces] = useState<ImportedPlace[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handlePickFile = async () => {
    try {
      const result = await ExpoDocumentPicker.getDocumentAsync({
        type: ['application/vnd.google-earth.kml+xml', 'application/json', 'application/geo+json', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      setFileName(file.name);

      const response = await fetch(file.uri);
      const text = await response.text();
      const parsed = parseGeoFile(text, file.name);

      if (parsed.length === 0) {
        showToast('Keine Orte in der Datei gefunden', 'error');
        return;
      }

      setPlaces(parsed);
      setSelected(new Set(parsed.map((_, i) => i)));
    } catch {
      showToast('Datei konnte nicht gelesen werden', 'error');
    }
  };

  const toggleSelect = (index: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === places.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(places.map((_, i) => i)));
    }
  };

  const handleImport = async () => {
    const selectedPlaces = places.filter((_, i) => selected.has(i));
    if (selectedPlaces.length === 0) return;

    setImporting(true);
    try {
      await onImport(selectedPlaces);
      showToast(`${selectedPlaces.length} Ort(e) importiert`, 'success');
      handleClose();
    } catch {
      showToast('Import fehlgeschlagen', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setPlaces([]);
    setSelected(new Set());
    setFileName(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose}>
        <TouchableOpacity style={styles.modal} activeOpacity={1} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>Orte importieren</Text>
          <Text style={styles.subtitle}>KML oder GeoJSON Datei auswahlen</Text>

          {places.length === 0 ? (
            <TouchableOpacity style={styles.pickBtn} onPress={handlePickFile} activeOpacity={0.7}>
              <Text style={styles.pickIcon}>📂</Text>
              <Text style={styles.pickText}>Datei wahlen</Text>
              {fileName && <Text style={styles.fileNameText}>{fileName}</Text>}
            </TouchableOpacity>
          ) : (
            <>
              <View style={styles.selectHeader}>
                <TouchableOpacity onPress={toggleAll}>
                  <Text style={styles.selectAllText}>
                    {selected.size === places.length ? 'Keine auswahlen' : 'Alle auswahlen'}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.countText}>{selected.size} / {places.length}</Text>
              </View>

              <ScrollView style={styles.placesList} showsVerticalScrollIndicator={false}>
                {places.map((place, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.placeRow, selected.has(i) && styles.placeRowSelected]}
                    onPress={() => toggleSelect(i)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.checkbox, selected.has(i) && styles.checkboxChecked]}>
                      {selected.has(i) && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <View style={styles.placeInfo}>
                      <Text style={styles.placeName} numberOfLines={1}>{place.name}</Text>
                      {place.description && <Text style={styles.placeDesc} numberOfLines={1}>{place.description}</Text>}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.actions}>
                <Button title="Abbrechen" onPress={handleClose} variant="ghost" style={styles.actionBtn} />
                <Button
                  title={`${selected.size} importieren`}
                  onPress={handleImport}
                  loading={importing}
                  disabled={selected.size === 0}
                  style={styles.actionBtn}
                />
              </View>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modal: { backgroundColor: '#FFFFFF', borderRadius: borderRadius.lg, padding: spacing.xl, width: '90%', maxWidth: 440, maxHeight: '80%', ...shadows.lg },
  title: { ...typography.h2, marginBottom: spacing.xs },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.lg },
  pickBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderStyle: 'dashed',
    gap: spacing.sm,
  },
  pickIcon: { fontSize: 40 },
  pickText: { ...typography.body, color: colors.textSecondary },
  fileNameText: { ...typography.caption, color: colors.textLight },
  selectHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  selectAllText: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },
  countText: { ...typography.caption, color: colors.textSecondary },
  placesList: { maxHeight: 300 },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: 2,
  },
  placeRowSelected: { backgroundColor: colors.primary + '08' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  placeInfo: { flex: 1 },
  placeName: { ...typography.body, fontWeight: '500' },
  placeDesc: { ...typography.caption, color: colors.textLight, marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  actionBtn: { flex: 1 },
});
