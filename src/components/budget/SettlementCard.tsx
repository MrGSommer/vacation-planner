import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Expense } from '../../types/database';
import { CollaboratorWithProfile } from '../../api/invitations';
import { calculateBalances, calculateSettlements, Settlement } from '../../utils/splitCalculator';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { Icon } from '../../utils/icons';

interface SettlementCardProps {
  expenses: Expense[];
  collaborators: CollaboratorWithProfile[];
  currency: string;
  currentUserId: string;
  onSettle?: (settlement: Settlement) => void;
}

export const SettlementCard: React.FC<SettlementCardProps> = ({
  expenses,
  collaborators,
  currency,
  currentUserId,
  onSettle,
}) => {
  const [expanded, setExpanded] = useState(true);

  const balances = useMemo(
    () => calculateBalances(expenses, collaborators),
    [expenses, collaborators],
  );

  const settlements = useMemo(
    () => calculateSettlements(balances),
    [balances],
  );

  if (balances.length === 0) return null;

  const allSettled = settlements.length === 0;

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(prev => !prev)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Icon name="swap-horizontal-outline" size={18} color={colors.primary} />
          <Text style={styles.title}>Ausgleich</Text>
        </View>
        {allSettled ? (
          <View style={styles.settledBadge}>
            <Icon name="checkmark-circle" size={14} color={colors.success} />
            <Text style={styles.settledBadgeText}>Ausgeglichen</Text>
          </View>
        ) : (
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textLight} />
        )}
      </TouchableOpacity>

      {/* Per-person balances */}
      <View style={styles.balances}>
        {balances.map(b => {
          const isSelf = b.userId === currentUserId;
          const isPositive = b.balance > 0.01;
          const isNegative = b.balance < -0.01;
          return (
            <View key={b.userId} style={styles.balanceRow}>
              <Text style={[styles.balanceName, isSelf && styles.balanceNameSelf]} numberOfLines={1}>
                {b.name}{isSelf ? ' (Du)' : ''}
              </Text>
              <Text style={[
                styles.balanceAmount,
                isPositive && styles.positiveBalance,
                isNegative && styles.negativeBalance,
              ]}>
                {isPositive ? '+' : ''}{b.balance.toFixed(2)} {currency}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Settlements (expanded) */}
      {expanded && settlements.length > 0 && (
        <View style={styles.settlements}>
          <Text style={styles.settlementsTitle}>Offene Zahlungen</Text>
          {settlements.map((s, i) => {
            const isMine = s.from === currentUserId || s.to === currentUserId;
            return (
              <View key={i} style={[styles.settlementRow, isMine && styles.settlementRowMine]}>
                <View style={styles.settlementInfo}>
                  <Text style={styles.settlementText}>
                    {s.fromName} <Text style={styles.settlementArrow}>&rarr;</Text> {s.toName}
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

      {expanded && allSettled && (
        <View style={styles.settledRow}>
          <Icon name="checkmark-circle-outline" size={20} color={colors.success} />
          <Text style={styles.settledText}>Alle Schulden sind ausgeglichen!</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { ...typography.h3 },
  settledBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${colors.success}15`, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.full },
  settledBadgeText: { ...typography.caption, fontSize: 10, fontWeight: '700', color: colors.success },
  balances: { gap: spacing.xs },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  balanceName: { ...typography.bodySmall, flex: 1 },
  balanceNameSelf: { fontWeight: '700' },
  balanceAmount: { ...typography.bodySmall, fontWeight: '600' },
  positiveBalance: { color: colors.success },
  negativeBalance: { color: colors.error },
  settlements: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  settlementsTitle: { ...typography.caption, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
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
  settlementArrow: { color: colors.textLight },
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
  settledRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.md },
  settledText: { ...typography.bodySmall, color: colors.success },
});
