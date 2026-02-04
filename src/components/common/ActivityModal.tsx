import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet, Keyboard, Platform, TouchableWithoutFeedback } from 'react-native';
import { Button } from './Button';
import { Input } from './Input';
import { TimePickerInput } from './TimePickerInput';
import { CategoryFieldsInput } from './CategoryFieldsInput';
import { PlaceAutocomplete, PlaceResult } from './PlaceAutocomplete';
import { ACTIVITY_CATEGORIES } from '../../utils/constants';
import { Activity } from '../../types/database';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

export interface ActivityFormData {
  title: string;
  category: string;
  startTime: string;
  locationName: string;
  locationLat: number | null;
  locationLng: number | null;
  locationAddress: string | null;
  notes: string;
  categoryData: Record<string, any>;
}

interface Props {
  visible: boolean;
  activity: Activity | null; // null = add mode
  onSave: (data: ActivityFormData) => void;
  onCancel: () => void;
  tripStartDate?: string;
  tripEndDate?: string;
  /** Filter which categories are shown. If omitted, all categories are shown. */
  categoryFilter?: string[];
  /** Default category for new activities */
  defaultCategory?: string;
  /** Default category data for new activities */
  defaultCategoryData?: Record<string, any>;
}

const CATEGORY_BASE_CONFIG: Record<string, { showTime: boolean; showPlace: boolean }> = {
  transport: { showTime: false, showPlace: false },
  hotel: { showTime: false, showPlace: true },
  stop: { showTime: false, showPlace: true },
};
const DEFAULT_BASE_CONFIG = { showTime: true, showPlace: true };

export const ActivityModal: React.FC<Props> = ({
  visible, activity, onSave, onCancel,
  tripStartDate, tripEndDate,
  categoryFilter, defaultCategory = 'activity', defaultCategoryData,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(defaultCategory);
  const [startTime, setStartTime] = useState('');
  const [location, setLocation] = useState('');
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const [locationAddress, setLocationAddress] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [categoryData, setCategoryData] = useState<Record<string, any>>({});

  // Reset form when modal opens/closes or activity changes
  useEffect(() => {
    if (visible) {
      if (activity) {
        setTitle(activity.title);
        setCategory(activity.category);
        setStartTime(activity.start_time || '');
        setLocation(activity.location_name || '');
        setLocationLat(activity.location_lat);
        setLocationLng(activity.location_lng);
        setLocationAddress(activity.location_address || null);
        setNotes(activity.description || '');
        setCategoryData(activity.category_data || {});
      } else {
        setTitle('');
        setCategory(defaultCategory);
        setStartTime('');
        setLocation('');
        setLocationLat(null);
        setLocationLng(null);
        setLocationAddress(null);
        setNotes('');
        setCategoryData(defaultCategoryData || {});
      }
    }
  }, [visible, activity]);

  const handleSave = () => {
    onSave({
      title: title.trim(),
      category,
      startTime,
      locationName: location.trim(),
      locationLat,
      locationLng,
      locationAddress,
      notes: notes.trim(),
      categoryData,
    });
  };

  const categories = categoryFilter
    ? ACTIVITY_CATEGORIES.filter(c => categoryFilter.includes(c.id))
    : ACTIVITY_CATEGORIES;

  const baseConfig = CATEGORY_BASE_CONFIG[category] || DEFAULT_BASE_CONFIG;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <TouchableWithoutFeedback onPress={() => { if (Platform.OS !== 'web') Keyboard.dismiss(); }}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>
            {activity ? 'Bearbeiten' : 'Hinzufügen'}
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Input label="Titel" placeholder="z.B. Stadtführung" value={title} onChangeText={setTitle} />

            <Text style={styles.fieldLabel}>Kategorie</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.catChip, category === cat.id && styles.catChipActive]}
                  onPress={() => { setCategory(cat.id); setCategoryData({}); }}
                >
                  <Text style={styles.catIcon}>{cat.icon}</Text>
                  <Text style={[styles.catLabel, category === cat.id && styles.catLabelActive]}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {baseConfig.showTime && (
              <TimePickerInput label="Uhrzeit" value={startTime} onChange={setStartTime} placeholder="z.B. 09:00" />
            )}

            <CategoryFieldsInput
              category={category}
              data={categoryData}
              onChange={setCategoryData}
              tripStartDate={tripStartDate}
              tripEndDate={tripEndDate}
            />

            {baseConfig.showPlace && (
              <PlaceAutocomplete
                label="Ort"
                placeholder="z.B. Sagrada Familia"
                value={location}
                onChangeText={setLocation}
                onSelect={(place: PlaceResult) => {
                  setLocation(place.name);
                  setLocationLat(place.lat);
                  setLocationLng(place.lng);
                  setLocationAddress(place.address);
                  const updates: Record<string, any> = {};
                  if (place.website) updates.website_url = place.website;
                  if (Object.keys(updates).length > 0) {
                    setCategoryData(prev => ({ ...prev, ...updates }));
                  }
                }}
              />
            )}

            <Input
              label="Notizen"
              placeholder="Optionale Notizen..."
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              style={{ height: 80, textAlignVertical: 'top' }}
            />
          </ScrollView>

          <View style={styles.buttons}>
            <Button title="Abbrechen" onPress={onCancel} variant="ghost" style={styles.btn} />
            <Button
              title={activity ? 'Speichern' : 'Hinzufügen'}
              onPress={handleSave}
              disabled={!title.trim()}
              style={styles.btn}
            />
          </View>
        </View>
      </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  content: { backgroundColor: colors.card, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl, maxHeight: '80%' },
  title: { ...typography.h2, marginBottom: spacing.lg },
  fieldLabel: { ...typography.bodySmall, fontWeight: '600', marginBottom: spacing.sm },
  categoryRow: { marginBottom: spacing.md },
  catChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm + 4, paddingVertical: spacing.sm, minHeight: 44, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, marginRight: spacing.sm },
  catChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  catIcon: { fontSize: 16, marginRight: 4 },
  catLabel: { ...typography.caption },
  catLabelActive: { color: colors.primary, fontWeight: '600' },
  buttons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  btn: { flex: 1 },
});
