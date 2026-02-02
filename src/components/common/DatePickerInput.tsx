import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

interface DatePickerInputProps {
  label?: string;
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
  /** Calendar opens on this date when value is empty */
  initialDate?: string;
  /** Dates before this are disabled */
  minDate?: string;
  /** Dates after this are disabled */
  maxDate?: string;
}

function formatDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

export const DatePickerInput: React.FC<DatePickerInputProps> = ({ label, value, onChange, placeholder, initialDate, minDate, maxDate }) => {
  const [visible, setVisible] = useState(false);

  const calendarCurrent = value || initialDate || undefined;

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity style={styles.input} onPress={() => setVisible(true)} activeOpacity={0.7}>
        <Text style={[styles.inputText, !value && styles.placeholder]}>
          {value ? formatDisplay(value) : placeholder || 'Datum wählen'}
        </Text>
        <Text style={styles.icon}>📅</Text>
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={styles.calendarContainer}>
            <Calendar
              current={calendarCurrent}
              minDate={minDate || undefined}
              maxDate={maxDate || undefined}
              markedDates={value ? { [value]: { selected: true, selectedColor: colors.primary } } : {}}
              onDayPress={(day: any) => {
                onChange(day.dateString);
                setVisible(false);
              }}
              theme={{
                todayTextColor: colors.primary,
                selectedDayBackgroundColor: colors.primary,
                arrowColor: colors.primary,
              }}
            />
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
  calendarContainer: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    width: 340,
  },
});
