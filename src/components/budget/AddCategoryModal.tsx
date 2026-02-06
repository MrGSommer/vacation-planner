import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Input, Button } from '../common';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

const COLOR_OPTIONS = [
  '#FF6B6B', '#4ECDC4', '#FFD93D', '#6C5CE7', '#74B9FF',
  '#00B894', '#E17055', '#FDCB6E', '#636E72', '#FF8B94',
];

interface AddCategoryModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string, color: string, budgetLimit: number | null) => void;
  currency: string;
  initialName?: string;
  initialColor?: string;
  initialLimit?: number | null;
  title?: string;
}

export const AddCategoryModal: React.FC<AddCategoryModalProps> = ({
  visible,
  onClose,
  onSave,
  currency,
  initialName = '',
  initialColor = COLOR_OPTIONS[0],
  initialLimit = null,
  title = 'Kategorie erstellen',
}) => {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [limit, setLimit] = useState(initialLimit != null ? String(initialLimit) : '');

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim(), color, limit ? parseFloat(limit) : null);
    setName('');
    setColor(COLOR_OPTIONS[0]);
    setLimit('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>

          <Input
            label="Name"
            placeholder="z.B. Transport"
            value={name}
            onChangeText={setName}
          />

          <Input
            label={`Budget-Limit (${currency})`}
            placeholder="Optional"
            value={limit}
            onChangeText={setLimit}
            keyboardType="decimal-pad"
          />

          <Text style={styles.fieldLabel}>Farbe</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorRow}>
            {COLOR_OPTIONS.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorSelected]}
                onPress={() => setColor(c)}
              />
            ))}
          </ScrollView>

          <View style={styles.buttons}>
            <Button title="Abbrechen" onPress={onClose} variant="ghost" style={styles.btn} />
            <Button title="Speichern" onPress={handleSave} disabled={!name.trim()} style={styles.btn} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  content: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
  },
  title: { ...typography.h2, marginBottom: spacing.lg },
  fieldLabel: { ...typography.bodySmall, fontWeight: '600', marginBottom: spacing.sm },
  colorRow: { marginBottom: spacing.lg },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: spacing.sm,
  },
  colorSelected: {
    borderWidth: 3,
    borderColor: colors.text,
  },
  buttons: { flexDirection: 'row', gap: spacing.md },
  btn: { flex: 1 },
});
