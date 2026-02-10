import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Input, Button } from '../common';
import { SplitWithPicker } from './SplitWithPicker';
import { BudgetCategory, Expense } from '../../types/database';
import { CollaboratorWithProfile } from '../../api/invitations';
import { getDisplayName } from '../../utils/profileHelpers';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

interface EditExpenseModalProps {
  visible: boolean;
  expense: Expense | null;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Expense>) => void;
  onDelete: (id: string) => void;
  onUpgradeToGroup?: (id: string, paidBy: string, splitWith: string[]) => void;
  categories: BudgetCategory[];
  collaborators: CollaboratorWithProfile[];
  currentUserId: string;
  currency: string;
  scope: 'group' | 'personal';
}

export const EditExpenseModal: React.FC<EditExpenseModalProps> = ({
  visible,
  expense,
  onClose,
  onSave,
  onDelete,
  onUpgradeToGroup,
  categories,
  collaborators,
  currentUserId,
  currency,
  scope,
}) => {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [splitWith, setSplitWith] = useState<string[]>([]);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    if (expense) {
      setAmount(String(expense.amount));
      setDescription(expense.description);
      setCategoryId(expense.category_id);
      setDate(expense.date);
      setPaidBy(expense.paid_by || currentUserId);
      setSplitWith(expense.split_with || []);
      setShowUpgrade(false);
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
    });
    onClose();
  };

  const handleUpgrade = () => {
    if (onUpgradeToGroup && splitWith.length > 0) {
      onUpgradeToGroup(expense.id, paidBy, splitWith);
      onClose();
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

            {scope === 'personal' && onUpgradeToGroup && !showUpgrade && (
              <Button
                title="Als Gruppe teilen"
                variant="secondary"
                onPress={() => setShowUpgrade(true)}
                style={{ marginBottom: spacing.md }}
              />
            )}

            {showUpgrade && (
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

                <Button
                  title="Jetzt teilen"
                  onPress={handleUpgrade}
                  disabled={splitWith.length === 0}
                  style={{ marginBottom: spacing.md }}
                />
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
  buttons: { flexDirection: 'row', gap: spacing.sm },
  btn: { flex: 1 },
});
