import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Input, Button } from '../common';
import { SplitWithPicker } from './SplitWithPicker';
import { BudgetCategory } from '../../types/database';
import { CollaboratorWithProfile } from '../../api/invitations';
import { getDisplayName } from '../../utils/profileHelpers';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { Icon } from '../../utils/icons';

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
}

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  visible,
  onClose,
  onSave,
  categories,
  collaborators,
  currentUserId,
  currency,
}) => {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [splitWith, setSplitWith] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [visibleTo, setVisibleTo] = useState<string[]>([currentUserId]);

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
  };

  const toggleVisibleTo = (userId: string) => {
    setVisibleTo(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
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

            {/* Privacy Toggle */}
            <TouchableOpacity
              style={[styles.privacyToggle, isPrivate && styles.privacyToggleActive]}
              onPress={() => setIsPrivate(prev => !prev)}
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
  buttons: { flexDirection: 'row', gap: spacing.md },
  btn: { flex: 1 },
});
