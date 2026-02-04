import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

interface TimePickerInputProps {
  label?: string;
  value: string;
  onChange: (time: string) => void;
  placeholder?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

export const TimePickerInput: React.FC<TimePickerInputProps> = ({ label, value, onChange, placeholder }) => {
  const [visible, setVisible] = useState(false);
  const [selectedHour, setSelectedHour] = useState(() => value ? value.split(':')[0] : '09');
  const [selectedMinute, setSelectedMinute] = useState(() => value ? value.split(':')[1] : '00');

  const handleOpen = () => {
    if (value) {
      const [h, m] = value.split(':');
      setSelectedHour(h);
      // Snap to nearest 5-min
      const mNum = parseInt(m, 10);
      setSelectedMinute(String(Math.round(mNum / 5) * 5 % 60).padStart(2, '0'));
    }
    setVisible(true);
  };

  const handleConfirm = () => {
    onChange(`${selectedHour}:${selectedMinute}`);
    setVisible(false);
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity style={styles.input} onPress={handleOpen} activeOpacity={0.7}>
        <Text style={[styles.inputText, !value && styles.placeholder]}>
          {value || placeholder || 'Uhrzeit wählen'}
        </Text>
        <Text style={styles.icon}>🕐</Text>
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={styles.pickerContainer} onStartShouldSetResponder={() => true}>
            <Text style={styles.pickerTitle}>Uhrzeit wählen</Text>
            <View style={styles.columns}>
              <View style={styles.column}>
                <Text style={styles.columnLabel}>Stunde</Text>
                <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                  {HOURS.map(h => (
                    <TouchableOpacity
                      key={h}
                      style={[styles.cell, selectedHour === h && styles.cellActive]}
                      onPress={() => setSelectedHour(h)}
                    >
                      <Text style={[styles.cellText, selectedHour === h && styles.cellTextActive]}>{h}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <Text style={styles.separator}>:</Text>
              <View style={styles.column}>
                <Text style={styles.columnLabel}>Minute</Text>
                <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                  {MINUTES.map(m => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.cell, selectedMinute === m && styles.cellActive]}
                      onPress={() => setSelectedMinute(m)}
                    >
                      <Text style={[styles.cellText, selectedMinute === m && styles.cellTextActive]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
            <View style={styles.buttons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setVisible(false)}>
                <Text style={styles.cancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
                <Text style={styles.confirmText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  inputText: { flex: 1, ...typography.body, color: colors.text },
  placeholder: { color: colors.textLight },
  icon: { fontSize: 18 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: 280,
  },
  pickerTitle: { ...typography.h3, textAlign: 'center', marginBottom: spacing.md },
  columns: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  column: { flex: 1, alignItems: 'center' },
  columnLabel: { ...typography.caption, color: colors.textLight, marginBottom: spacing.xs },
  scroll: { maxHeight: 200 },
  separator: { ...typography.h2, color: colors.textLight, marginHorizontal: spacing.sm, marginTop: spacing.lg },
  cell: {
    width: 52,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    marginVertical: 2,
  },
  cellActive: { backgroundColor: colors.primary },
  cellText: { ...typography.body, color: colors.text },
  cellTextActive: { color: '#FFFFFF', fontWeight: '600' },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.lg, gap: spacing.md },
  cancelBtn: { paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.md, minHeight: 44, justifyContent: 'center' as const },
  cancelText: { ...typography.body, color: colors.textLight },
  confirmBtn: { paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.md, minHeight: 44, justifyContent: 'center' as const, backgroundColor: colors.primary, borderRadius: borderRadius.md },
  confirmText: { ...typography.body, color: '#FFFFFF', fontWeight: '600' },
});
