import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Input, Button } from '../common';
import { SplitWithPicker } from './SplitWithPicker';
import { BudgetCategory, Expense } from '../../types/database';
import { CollaboratorWithProfile } from '../../api/invitations';
import { getDisplayName } from '../../utils/profileHelpers';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { Icon } from '../../utils/icons';

interface EditExpenseModalProps {
  visible: boolean;
  expense: Expense | null;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Expense>) => void;
  onDelete: (id: string) => void;
  categories: BudgetCategory[];
  collaborators: CollaboratorWithProfile[];
  currentUserId: string;
  currency: string;
}

export const EditExpenseModal: React.FC<EditExpenseModalProps> = ({
  visible,
  expense,
  onClose,
  onSave,
  onDelete,
  categories,
  collaborators,
  currentUserId,
  currency,
}) => {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [splitWith, setSplitWith] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [visibleTo, setVisibleTo] = useState<string[]>([]);

  useEffect(() => {
    if (expense) {
      setAmount(String(expense.amount));
      setDescription(expense.description);
      setCategoryId(expense.category_id);
      setDate(expense.date);
      setPaidBy(expense.paid_by || currentUserId);
      setSplitWith(expense.split_with || []);
      setIsPrivate(expense.scope === 'personal');
      setVisibleTo(expense.visible_to?.length ? expense.visible_to : [currentUserId]);
    }
  }, [expense, currentUserId]);

  if (!expense) return null;

  const handleSave = () => {
    if (!amount || !description.trim() || !categoryId) return;
    onSave(expense.id, {
      amount: parseFloat(amount),
      description: description.trim(),
      category_id: categoryId,
      date,
      scope: isPrivate ? 'personal' : 'group',
      visible_to: isPrivate ? visibleTo : [],
      paid_by: isPrivate ? null : paidBy,
      split_with: isPrivate ? [] : splitWith,
    });
    onClose();
  };

  const toggleVisibleTo = (userId: string) => {
    setVisibleTo(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleTogglePrivacy = (newPrivate: boolean) => {
    setIsPrivate(newPrivate);
    if (newPrivate) {
      setVisibleTo([currentUserId]);
    } else {
      setPaidBy(currentUserId);
      setSplitWith(collaborators.map(c => c.user_id));
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.content}>
            <Text style={styles.title}>Ausgabe bearbeiten</Text>

            <Input
              label={`Betrag (${currency})`}
              placeholder="0.00"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />

            <Input
              label="Beschreibung"
              placeholder="z.B. Abendessen"
              value={description}
              onChangeText={setDescription}
            />

            <Input
              label="Datum"
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
            />

            <Text style={styles.fieldLabel}>Kategorie</Text>
            <View style={styles.catRow}>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.catChip,
                    categoryId === cat.id && { backgroundColor: cat.color, borderColor: cat.color },
                  ]}
                  onPress={() => setCategoryId(cat.id)}
                >
                  <Text style={[styles.catText, categoryId === cat.id && { color: '#fff' }]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Privacy Toggle */}
            <TouchableOpacity
              style={[styles.privacyToggle, isPrivate && styles.privacyToggleActive]}
              onPress={() => handleTogglePrivacy(!isPrivate)}
              activeOpacity={0.7}
            >
              <Icon
                name={isPrivate ? 'lock-closed' : 'lock-open-outline'}
                size={16}
                color={isPrivate ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.privacyText, isPrivate && styles.privacyTextActive]}>
                Privat
              </Text>
            </TouchableOpacity>

            {isPrivate && collaborators.length > 1 && (
              <>
                <Text style={styles.fieldLabel}>Sichtbar für</Text>
                <View style={styles.catRow}>
                  {collaborators.map(c => (
                    <TouchableOpacity
                      key={c.user_id}
                      style={[
                        styles.catChip,
                        visibleTo.includes(c.user_id) && { backgroundColor: colors.secondary, borderColor: colors.secondary },
                      ]}
                      onPress={() => {
                        if (c.user_id === currentUserId) return;
                        toggleVisibleTo(c.user_id);
                      }}
                    >
                      <Text style={[styles.catText, visibleTo.includes(c.user_id) && { color: '#fff' }]}>
                        {getDisplayName(c.profile)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {!isPrivate && collaborators.length > 0 && (
              <>
                <Text style={styles.fieldLabel}>Bezahlt von</Text>
                <View style={styles.catRow}>
                  {collaborators.map(c => (
                    <TouchableOpacity
                      key={c.user_id}
                      style={[
                        styles.catChip,
                        paidBy === c.user_id && { backgroundColor: colors.secondary, borderColor: colors.secondary },
                      ]}
                      onPress={() => setPaidBy(c.user_id)}
                    >
                      <Text style={[styles.catText, paidBy === c.user_id && { color: '#fff' }]}>
                        {getDisplayName(c.profile)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>Geteilt mit</Text>
                <SplitWithPicker
                  collaborators={collaborators}
                  selected={splitWith}
                  onChange={setSplitWith}
                />
                <View style={{ height: spacing.md }} />
              </>
            )}

            <View style={styles.buttons}>
              <Button
                title="Löschen"
                variant="ghost"
                onPress={() => { onDelete(expense.id); onClose(); }}
                style={styles.btn}
              />
              <Button title="Abbrechen" onPress={onClose} variant="ghost" style={styles.btn} />
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
    padding: spacing.xl,
    maxHeight: '90%',
  },
  title: { ...typography.h2, marginBottom: spacing.lg },
  fieldLabel: { ...typography.bodySmall, fontWeight: '600', marginBottom: spacing.sm },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  catChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center' as const,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  catText: { ...typography.caption, fontWeight: '600' },
  privacyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignSelf: 'flex-start',
    marginBottom: spacing.lg,
  },
  privacyToggleActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
  },
  privacyText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  privacyTextActive: { color: colors.primary },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  btn: { flex: 1 },
});
