import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Input, Button } from '../common';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { Icon, IconName } from '../../utils/icons';

const COLOR_OPTIONS = [
  '#FF6B6B', '#4ECDC4', '#FFD93D', '#6C5CE7', '#74B9FF',
  '#00B894', '#E17055', '#FDCB6E', '#636E72', '#FF8B94',
];

interface AddCategoryModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string, color: string, budgetLimit: number | null, scope: 'group' | 'personal') => void;
  currency: string;
  initialName?: string;
  initialColor?: string;
  initialLimit?: number | null;
  initialScope?: 'group' | 'personal';
  title?: string;
  showScopeToggle?: boolean;
}

export const AddCategoryModal: React.FC<AddCategoryModalProps> = ({
  visible,
  onClose,
  onSave,
  currency,
  initialName = '',
  initialColor = COLOR_OPTIONS[0],
  initialLimit = null,
  initialScope = 'group',
  title = 'Kategorie erstellen',
  showScopeToggle = true,
}) => {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [limit, setLimit] = useState(initialLimit != null ? String(initialLimit) : '');
  const [scope, setScope] = useState<'group' | 'personal'>(initialScope);

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setColor(initialColor);
      setLimit(initialLimit != null ? String(initialLimit) : '');
      setScope(initialScope);
    }
  }, [visible, initialName, initialColor, initialLimit, initialScope]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim(), color, limit ? parseFloat(limit) : null, scope);
    setName('');
    setColor(COLOR_OPTIONS[0]);
    setLimit('');
    setScope('group');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.content} activeOpacity={1} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>

          {showScopeToggle && (
            <View style={styles.scopeRow}>
              <TouchableOpacity
                style={[styles.scopeBtn, scope === 'group' && styles.scopeBtnActive]}
                onPress={() => setScope('group')}
                activeOpacity={0.7}
              >
                <Icon name="people-outline" size={16} color={scope === 'group' ? '#FFFFFF' : colors.textSecondary} />
                <Text style={[styles.scopeText, scope === 'group' && styles.scopeTextActive]}>Gruppe</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.scopeBtn, scope === 'personal' && styles.scopeBtnActivePersonal]}
                onPress={() => setScope('personal')}
                activeOpacity={0.7}
              >
                <Icon name="person-outline" size={16} color={scope === 'personal' ? '#FFFFFF' : colors.textSecondary} />
                <Text style={[styles.scopeText, scope === 'personal' && styles.scopeTextActive]}>Privat</Text>
              </TouchableOpacity>
            </View>
          )}

          {scope === 'personal' && (
            <Text style={styles.scopeHint}>Nur für dich sichtbar</Text>
          )}

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
        </TouchableOpacity>
      </TouchableOpacity>
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
  scopeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  scopeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scopeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  scopeBtnActivePersonal: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  scopeText: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  scopeTextActive: { color: '#FFFFFF' },
  scopeHint: {
    ...typography.caption,
    color: colors.secondary,
    marginBottom: spacing.sm,
    fontStyle: 'italic',
  },
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
