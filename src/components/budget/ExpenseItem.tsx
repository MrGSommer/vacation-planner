import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card, Avatar } from '../common';
import { Expense } from '../../types/database';
import { CollaboratorWithProfile } from '../../api/invitations';
import { formatDate } from '../../utils/dateHelpers';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

interface ExpenseItemProps {
  expense: Expense;
  currency: string;
  showPaidBy?: boolean;
  collaborators?: CollaboratorWithProfile[];
  onPress: () => void;
  onLongPress: () => void;
}

export const ExpenseItem: React.FC<ExpenseItemProps> = ({
  expense,
  currency,
  showPaidBy = false,
  collaborators = [],
  onPress,
  onLongPress,
}) => {
  const catName = expense.budget_categories?.name;
  const catColor = expense.budget_categories?.color;
  const paidByCollab = showPaidBy && expense.paid_by
    ? collaborators.find(c => c.user_id === expense.paid_by)
    : null;

  return (
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}>
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.left}>
            <View style={styles.titleRow}>
              <Text style={styles.desc} numberOfLines={1}>{expense.description}</Text>
              {catName && (
                <View style={[styles.chip, { backgroundColor: catColor ? `${catColor}20` : colors.border }]}>
                  <Text style={[styles.chipText, catColor ? { color: catColor } : null]}>{catName}</Text>
                </View>
              )}
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.date}>{formatDate(expense.date)}</Text>
              {paidByCollab && (
                <View style={styles.paidBy}>
                  <Avatar
                    uri={paidByCollab.profile.avatar_url}
                    name={paidByCollab.profile.full_name || paidByCollab.profile.email}
                    size={18}
                  />
                  <Text style={styles.paidByText} numberOfLines={1}>
                    {paidByCollab.profile.full_name || paidByCollab.profile.email.split('@')[0]}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <Text style={styles.amount}>{currency} {expense.amount.toFixed(2)}</Text>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  left: { flex: 1, marginRight: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  desc: { ...typography.body, fontWeight: '500', flexShrink: 1 },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  chipText: { ...typography.caption, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: spacing.sm },
  date: { ...typography.caption },
  paidBy: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  paidByText: { ...typography.caption, maxWidth: 100 },
  amount: { ...typography.body, fontWeight: '700', color: colors.primary },
});
