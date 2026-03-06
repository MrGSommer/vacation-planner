import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card, Avatar } from '../common';
import { Expense } from '../../types/database';
import { CollaboratorWithProfile } from '../../api/invitations';
import { formatDate } from '../../utils/dateHelpers';
import { getDisplayName } from '../../utils/profileHelpers';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { Icon } from '../../utils/icons';

interface ExpenseItemProps {
  expense: Expense;
  currency: string;
  currentUserId?: string;
  showPaidBy?: boolean;
  collaborators?: CollaboratorWithProfile[];
  onPress: () => void;
  onLongPress: () => void;
}

export const ExpenseItem: React.FC<ExpenseItemProps> = ({
  expense,
  currency,
  currentUserId,
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

  // Calculate user's share
  const isGroup = expense.scope === 'group' && expense.split_with.length > 0;
  const myShare = isGroup && currentUserId
    ? (expense.split_with.includes(currentUserId) ? expense.amount / expense.split_with.length : 0)
    : expense.amount;
  const iPaid = expense.paid_by === currentUserId;
  const showShare = isGroup && currentUserId && expense.split_with.length > 1;

  return (
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}>
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.left}>
            <View style={styles.titleRow}>
              {expense.receipt_id && (
                <Icon name="receipt-outline" size={14} color={colors.secondary} />
              )}
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
                <Text style={styles.paidByText} numberOfLines={1}>
                  {getDisplayName(paidByCollab.profile)}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.amountCol}>
            {expense.scope === 'personal' && (
              <Icon name="lock-closed-outline" size={12} color={colors.textSecondary} />
            )}
            {showShare ? (
              <>
                <Text style={[styles.shareAmount, iPaid ? styles.sharePositive : styles.shareNegative]}>
                  {iPaid ? `+${(expense.amount - myShare).toFixed(2)}` : myShare > 0 ? `-${myShare.toFixed(2)}` : '–'}
                </Text>
                <Text style={styles.totalAmount}>{currency} {expense.amount.toFixed(2)}</Text>
              </>
            ) : (
              <Text style={styles.amount}>{currency} {expense.amount.toFixed(2)}</Text>
            )}
          </View>
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
  paidByText: { ...typography.caption, color: colors.textSecondary, maxWidth: 100 },
  amountCol: { alignItems: 'flex-end', gap: 1 },
  amount: { ...typography.body, fontWeight: '700', color: colors.text },
  shareAmount: { ...typography.body, fontWeight: '700' },
  sharePositive: { color: colors.success },
  shareNegative: { color: colors.error },
  totalAmount: { ...typography.caption, color: colors.textLight, fontSize: 10 },
});
