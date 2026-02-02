import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Input } from './Input';
import { DatePickerInput } from './DatePickerInput';
import { TimePickerInput } from './TimePickerInput';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import { PlaceResult } from './PlaceAutocomplete';
import { CATEGORY_FIELDS, CategoryField } from '../../utils/categoryFields';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

interface Props {
  category: string;
  data: Record<string, any>;
  onChange: (data: Record<string, any>) => void;
  tripStartDate?: string;
  tripEndDate?: string;
}

// Maps end-date keys to their corresponding start-date keys
// Maps end-date keys to their corresponding start-date keys (for minDate constraint)
const DATE_PAIRS: Record<string, string> = {
  check_out_date: 'check_in_date',
};

export const CategoryFieldsInput: React.FC<Props> = ({ category, data, onChange, tripStartDate, tripEndDate }) => {
  const fields = CATEGORY_FIELDS[category];
  if (!fields || fields.length === 0) return null;

  const update = (key: string, value: any) => {
    onChange({ ...data, [key]: value });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Details</Text>
      {fields.map((field) => {
        switch (field.type) {
          case 'text':
            return (
              <Input
                key={field.key}
                label={field.label}
                placeholder={field.placeholder}
                value={data[field.key] || ''}
                onChangeText={(v: string) => update(field.key, v)}
              />
            );
          case 'time':
            return (
              <TimePickerInput
                key={field.key}
                label={field.label}
                value={data[field.key] || ''}
                onChange={(v: string) => update(field.key, v)}
                placeholder={field.placeholder}
              />
            );
          case 'date': {
            const startKey = DATE_PAIRS[field.key];
            const startValue = startKey ? data[startKey] : undefined;
            return (
              <DatePickerInput
                key={field.key}
                label={field.label}
                value={data[field.key] || ''}
                onChange={(v: string) => update(field.key, v)}
                placeholder={field.placeholder}
                initialDate={startValue || tripStartDate || undefined}
                minDate={startValue || tripStartDate || undefined}
                maxDate={tripEndDate || undefined}
              />
            );
          }
          case 'select':
            return (
              <View key={field.key} style={styles.selectContainer}>
                <Text style={styles.fieldLabel}>{field.label}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {(field.options || []).map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.chip, data[field.key] === opt && styles.chipActive]}
                      onPress={() => update(field.key, data[field.key] === opt ? '' : opt)}
                    >
                      <Text style={[styles.chipText, data[field.key] === opt && styles.chipTextActive]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            );
          case 'place':
            return (
              <PlaceAutocomplete
                key={field.key}
                label={field.label}
                placeholder={field.placeholder}
                value={data[`${field.key}_name`] || ''}
                onChangeText={(v: string) => update(`${field.key}_name`, v)}
                onSelect={(place: PlaceResult) => {
                  onChange({
                    ...data,
                    [`${field.key}_name`]: place.name,
                    [`${field.key}_lat`]: place.lat,
                    [`${field.key}_lng`]: place.lng,
                  });
                }}
              />
            );
          default:
            return null;
        }
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginTop: spacing.sm },
  sectionLabel: { ...typography.bodySmall, fontWeight: '700', color: colors.primary, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
  selectContainer: { marginBottom: spacing.md },
  fieldLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  chipText: { ...typography.caption, color: colors.textSecondary },
  chipTextActive: { color: colors.primary, fontWeight: '600' },
});
