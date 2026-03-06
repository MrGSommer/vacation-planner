import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card } from '../common';
import { Expense } from '../../types/database';
import { CollaboratorWithProfile } from '../../api/invitations';
import { calculateBalances, calculateSettlements, Settlement } from '../../utils/splitCalculator';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { Icon } from '../../utils/icons';

interface ExpenseSummaryCardProps {
  expenses: Expense[];
  collaborators: CollaboratorWithProfile[];
  currency: string;
  currentUserId: string;
  groupExpenses?: Expense[];
  onSettle?: (settlement: Settlement) => void;
}

export const ExpenseSummaryCard: React.FC<ExpenseSummaryCardProps> = ({
  expenses, collaborators, currency, currentUserId, groupExpenses, onSettle,
}) => {
  const [showSettlement, setShowSettlement] = useState(false);

  const totalSpent = useMemo(
    () => expenses.reduce((s, e) => s + e.amount, 0),
    [expenses],
  );

  const effectiveGroupExpenses = groupExpenses ?? expenses.filter(e => e.scope === 'group');

  const balances = useMemo(
    () => calculateBalances(effectiveGroupExpenses, collaborators),
    [effectiveGroupExpenses, collaborators],
  );

  const settlements = useMemo(
    () => calculateSettlements(balances),
    [balances],
  );

  const myBalance = balances.find(b => b.userId === currentUserId);
  const balance = myBalance?.balance ?? 0;
  const isPositive = balance > 0.01;
  const isNegative = balance < -0.01;
  const hasSettlements = settlements.length > 0;

  return (
    <Card style={styles.card}>
      {/* Stats Row */}
      <TouchableOpacity
        style={styles.row}
        onPress={balances.length > 0 ? () => setShowSettlement(v => !v) : undefined}
        activeOpacity={balances.length > 0 ? 0.7 : 1}
      >
        <View style={styles.col}>
          <View style={styles.iconLabel}>
            <Icon name="wallet-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.label}>Gesamt</Text>
          </View>
          <Text style={styles.value}>{currency} {totalSpent.toFixed(2)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.col}>
          <View style={styles.iconLabel}>
            <Icon name="person-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.label}>Bezahlt</Text>
          </View>
          <Text style={styles.value}>{currency} {(myBalance?.paid ?? 0).toFixed(2)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.col}>
          <View style={styles.iconLabel}>
            <Icon name={isNegative ? 'trending-down-outline' : 'trending-up-outline'} size={14} color={isPositive ? colors.success : isNegative ? colors.error : colors.textSecondary} />
            <Text style={styles.label}>Saldo</Text>
          </View>
          <Text style={[
            styles.value,
            isPositive && { color: colors.success },
            isNegative && { color: colors.error },
          ]}>
            {isPositive ? '+' : ''}{balance.toFixed(2)}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Expand indicator */}
      {balances.length > 0 && (
        <TouchableOpacity
          style={styles.expandRow}
          onPress={() => setShowSettlement(v => !v)}
          activeOpacity={0.7}
        >
          <Icon name="swap-horizontal-outline" size={14} color={colors.textLight} />
          <Text style={styles.expandText}>
            {hasSettlements ? `${settlements.length} offene Zahlung${settlements.length > 1 ? 'en' : ''}` : 'Ausgeglichen'}
          </Text>
          <Icon name={showSettlement ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textLight} />
        </TouchableOpacity>
      )}

      {/* Settlement Section (expandable) */}
      {showSettlement && (
        <View style={styles.settlementSection}>
          {/* Per-person balances */}
          {balances.map(b => {
            const isSelf = b.userId === currentUserId;
            const bPositive = b.balance > 0.01;
            const bNegative = b.balance < -0.01;
            return (
              <View key={b.userId} style={styles.balanceRow}>
                <Text style={[styles.balanceName, isSelf && styles.balanceNameSelf]} numberOfLines={1}>
                  {b.name}{isSelf ? ' (Du)' : ''}
                </Text>
                <Text style={[
                  styles.balanceAmount,
                  bPositive && { color: colors.success },
                  bNegative && { color: colors.error },
                ]}>
                  {bPositive ? '+' : ''}{b.balance.toFixed(2)} {currency}
                </Text>
              </View>
            );
          })}

          {/* Settlement payments */}
          {settlements.length > 0 && (
            <View style={styles.settlementsBlock}>
              <Text style={styles.settlementsTitle}>Offene Zahlungen</Text>
              {settlements.map((s, i) => {
                const isMine = s.from === currentUserId || s.to === currentUserId;
                return (
                  <View key={i} style={[styles.settlementRow, isMine && styles.settlementRowMine]}>
                    <View style={styles.settlementInfo}>
                      <Text style={styles.settlementText} numberOfLines={1}>
                        {s.fromName} → {s.toName}
                      </Text>
                      <Text style={styles.settlementAmount}>
                        {currency} {s.amount.toFixed(2)}
                      </Text>
                    </View>
                    {onSettle && isMine && (
                      <TouchableOpacity
                        style={styles.settleBtn}
                        onPress={() => onSettle(s)}
                        activeOpacity={0.7}
                      >
                        <Icon name="checkmark-outline" size={14} color="#fff" />
                        <Text style={styles.settleBtnText}>Begleichen</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {settlements.length === 0 && (
            <View style={styles.settledRow}>
              <Icon name="checkmark-circle-outline" size={16} color={colors.success} />
              <Text style={styles.settledText}>Alle Schulden sind ausgeglichen!</Text>
            </View>
          )}
        </View>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  col: { flex: 1, alignItems: 'center', gap: 2 },
  divider: { width: 1, height: 28, backgroundColor: colors.border },
  iconLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { ...typography.caption, color: colors.textSecondary },
  value: { ...typography.bodySmall, fontWeight: '700', color: colors.text },

  // Expand indicator
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  expandText: { ...typography.caption, color: colors.textLight },

  // Settlement section
  settlementSection: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  balanceName: { ...typography.bodySmall, flex: 1 },
  balanceNameSelf: { fontWeight: '700' },
  balanceAmount: { ...typography.bodySmall, fontWeight: '600' },

  settlementsBlock: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  settlementsTitle: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  settlementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  settlementRowMine: { backgroundColor: `${colors.primary}08` },
  settlementInfo: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginRight: spacing.sm },
  settlementText: { ...typography.bodySmall, flex: 1 },
  settlementAmount: { ...typography.bodySmall, fontWeight: '700', color: colors.primary },
  settleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  settleBtnText: { ...typography.caption, fontSize: 11, fontWeight: '700', color: '#fff' },
  settledRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.xs },
  settledText: { ...typography.bodySmall, color: colors.success },
});
