import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Input, Button } from '../common';
import { SplitWithPicker } from './SplitWithPicker';
import { BudgetCategory } from '../../types/database';
import { CollaboratorWithProfile } from '../../api/invitations';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

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
  }) => void;
  categories: BudgetCategory[];
  collaborators: CollaboratorWithProfile[];
  currentUserId: string;
  currency: string;
  scope: 'group' | 'personal';
}

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  visible,
  onClose,
  onSave,
  categories,
  collaborators,
  currentUserId,
  currency,
  scope,
}) => {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [splitWith, setSplitWith] = useState<string[]>([]);

  // Default split_with to all collaborators when opening in group mode
  useEffect(() => {
    if (visible && scope === 'group') {
      setPaidBy(currentUserId);
      setSplitWith(collaborators.map(c => c.user_id));
    }
  }, [visible, scope, collaborators, currentUserId]);

  const handleSave = () => {
    if (!amount || !description.trim() || !categoryId) return;
    onSave({
      amount: parseFloat(amount),
      description: description.trim(),
      category_id: categoryId,
      date,
      paid_by: scope === 'group' ? paidBy : null,
      split_with: scope === 'group' ? splitWith : [],
    });
    reset();
    onClose();
  };

  const reset = () => {
    setAmount('');
    setDescription('');
    setCategoryId('');
    setDate(new Date().toISOString().split('T')[0]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.content}>
            <Text style={styles.title}>Ausgabe erfassen</Text>

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

            {scope === 'group' && collaborators.length > 0 && (
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
                        {c.profile.full_name || c.profile.email.split('@')[0]}
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
  buttons: { flexDirection: 'row', gap: spacing.md },
  btn: { flex: 1 },
});
