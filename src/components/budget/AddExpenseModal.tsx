import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Platform, TextInput } from 'react-native';
import { Input, Button, DatePickerInput } from '../common';
import { BudgetCategory } from '../../types/database';
import { CollaboratorWithProfile } from '../../api/invitations';
import { getDisplayName } from '../../utils/profileHelpers';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { Icon } from '../../utils/icons';

const CATEGORY_COLORS = [
  '#FF6B6B', '#4ECDC4', '#FFD93D', '#6C5CE7', '#74B9FF',
  '#00B894', '#E17055', '#FDCB6E', '#636E72', '#FF8B94',
];

interface AddExpenseModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: {
    amount: number;
    description: string;
    category_id: string;
    date: string;
    paid_by: string | null;
    split_with: string[];
    scope: 'group' | 'personal';
    visible_to: string[];
  }) => void;
  categories: BudgetCategory[];
  collaborators: CollaboratorWithProfile[];
  currentUserId: string;
  currency: string;
  onCreateCategory?: (name: string, color: string) => Promise<void>;
}

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  visible,
  onClose,
  onSave,
  categories,
  collaborators,
  currentUserId,
  currency,
  onCreateCategory,
}) => {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [splitWith, setSplitWith] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [visibleTo, setVisibleTo] = useState<string[]>([currentUserId]);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const newCatRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setPaidBy(currentUserId);
      setSplitWith(collaborators.map(c => c.user_id));
      setIsPrivate(false);
      setVisibleTo([currentUserId]);
    }
  }, [visible, collaborators, currentUserId]);

  const handleSave = () => {
    if (!amount || !description.trim() || !categoryId) return;
    onSave({
      amount: parseFloat(amount),
      description: description.trim(),
      category_id: categoryId,
      date,
      paid_by: isPrivate ? null : paidBy,
      split_with: isPrivate ? [] : splitWith,
      scope: isPrivate ? 'personal' : 'group',
      visible_to: isPrivate ? visibleTo : [],
    });
    reset();
    onClose();
  };

  const reset = () => {
    setAmount('');
    setDescription('');
    setCategoryId('');
    setDate(new Date().toISOString().split('T')[0]);
    setIsPrivate(false);
    setShowNewCat(false);
    setNewCatName('');
  };

  const handleCreateCategory = async () => {
    const name = newCatName.trim();
    if (!name || !onCreateCategory) return;
    const usedColors = new Set(categories.map(c => c.color));
    const available = CATEGORY_COLORS.filter(c => !usedColors.has(c));
    const color = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)];
    await onCreateCategory(name, color);
    setNewCatName('');
    setShowNewCat(false);
  };

  const toggleVisibleTo = (userId: string) => {
    setVisibleTo(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const toggleSplitWith = (userId: string) => {
    setSplitWith(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>Ausgabe erfassen</Text>
              <TouchableOpacity onPress={() => { reset(); onClose(); }} hitSlop={8}>
                <Icon name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Row: Betrag + Datum */}
            <View style={styles.row}>
              <View style={styles.amountInput}>
                <Input
                  label={`Betrag (${currency})`}
                  placeholder="0.00"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  containerStyle={styles.noMargin}
                />
              </View>
              <View style={styles.dateInput}>
                <DatePickerInput
                  label="Datum"
                  value={date}
                  onChange={setDate}
                  maxDate={new Date().toISOString().split('T')[0]}
                  containerStyle={styles.noMargin}
                />
              </View>
            </View>

            <Input
              label="Beschreibung"
              placeholder="z.B. Abendessen"
              value={description}
              onChangeText={setDescription}
              containerStyle={styles.inputSpacing}
            />

            {/* Kategorie + Privat inline */}
            <View style={styles.sectionHeader}>
              <Text style={styles.fieldLabel}>Kategorie</Text>
              <TouchableOpacity
                style={[styles.privacyToggle, isPrivate && styles.privacyToggleActive]}
                onPress={() => setIsPrivate(prev => !prev)}
                activeOpacity={0.7}
              >
                <Icon
                  name={isPrivate ? 'lock-closed' : 'lock-open-outline'}
                  size={13}
                  color={isPrivate ? colors.primary : colors.textSecondary}
                />
                <Text style={[styles.privacyText, isPrivate && styles.privacyTextActive]}>
                  Privat
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.chipRow}>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.chip,
                    categoryId === cat.id && { backgroundColor: cat.color, borderColor: cat.color },
                  ]}
                  onPress={() => setCategoryId(cat.id)}
                >
                  <Text style={[styles.chipText, categoryId === cat.id && { color: '#fff' }]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
              {onCreateCategory && !showNewCat && (
                <TouchableOpacity style={styles.addChip} onPress={() => { setShowNewCat(true); setTimeout(() => newCatRef.current?.focus(), 100); }}>
                  <Icon name="add" size={14} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>
            {showNewCat && (
              <View style={styles.newCatRow}>
                <TextInput
                  ref={newCatRef}
                  style={styles.newCatInput}
                  placeholder="Kategorie-Name"
                  placeholderTextColor={colors.textLight}
                  value={newCatName}
                  onChangeText={setNewCatName}
                  onSubmitEditing={handleCreateCategory}
                  returnKeyType="done"
                />
                <TouchableOpacity style={styles.newCatConfirm} onPress={handleCreateCategory}>
                  <Icon name="checkmark" size={16} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowNewCat(false); setNewCatName(''); }}>
                  <Icon name="close" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            {isPrivate && collaborators.length > 1 && (
              <>
                <Text style={styles.fieldLabel}>Sichtbar für</Text>
                <View style={styles.chipRow}>
                  {collaborators.map(c => (
                    <TouchableOpacity
                      key={c.user_id}
                      style={[
                        styles.chip,
                        visibleTo.includes(c.user_id) && { backgroundColor: colors.secondary, borderColor: colors.secondary },
                      ]}
                      onPress={() => {
                        if (c.user_id === currentUserId) return;
                        toggleVisibleTo(c.user_id);
                      }}
                    >
                      <Text style={[styles.chipText, visibleTo.includes(c.user_id) && { color: '#fff' }]}>
                        {getDisplayName(c.profile)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {!isPrivate && collaborators.length > 1 && (
              <>
                {/* Bezahlt von + Geteilt mit in compact rows */}
                <Text style={styles.fieldLabel}>Bezahlt von</Text>
                <View style={styles.chipRow}>
                  {collaborators.map(c => (
                    <TouchableOpacity
                      key={c.user_id}
                      style={[
                        styles.chip,
                        paidBy === c.user_id && { backgroundColor: colors.secondary, borderColor: colors.secondary },
                      ]}
                      onPress={() => setPaidBy(c.user_id)}
                    >
                      <Text style={[styles.chipText, paidBy === c.user_id && { color: '#fff' }]}>
                        {getDisplayName(c.profile)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>Geteilt mit</Text>
                <View style={styles.chipRow}>
                  {collaborators.map(c => {
                    const sel = splitWith.includes(c.user_id);
                    return (
                      <TouchableOpacity
                        key={c.user_id}
                        style={[styles.chip, sel && { backgroundColor: colors.secondary, borderColor: colors.secondary }]}
                        onPress={() => toggleSplitWith(c.user_id)}
                      >
                        <Text style={[styles.chipText, sel && { color: '#fff' }]}>
                          {getDisplayName(c.profile)}
                        </Text>
                        {sel && <Icon name="checkmark" size={12} color="#fff" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <View style={styles.buttons}>
              <Button title="Abbrechen" onPress={() => { reset(); onClose(); }} variant="ghost" style={styles.btn} />
              <Button
                title="Speichern"
                onPress={handleSave}
                disabled={!amount || !description || !categoryId}
                style={styles.btn}
              />
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  scrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
  content: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '90%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { ...typography.h3, fontWeight: '700' },
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  amountInput: { flex: 1 },
  dateInput: { flex: 1 },
  noMargin: { marginBottom: 0 },
  inputSpacing: { marginBottom: spacing.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  fieldLabel: { ...typography.caption, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chipText: { ...typography.caption, fontWeight: '600' },
  addChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  newCatInput: {
    flex: 1,
    height: 36,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    ...typography.caption,
    color: colors.text,
    outlineStyle: 'none' as any,
  },
  newCatConfirm: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  privacyToggleActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
  },
  privacyText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  privacyTextActive: { color: colors.primary },
  buttons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  btn: { flex: 1 },
});
