import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Expense } from '../../types/database';
import { CollaboratorWithProfile } from '../../api/invitations';
import { calculateBalances, calculateSettlements } from '../../utils/splitCalculator';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';

interface SettlementCardProps {
  expenses: Expense[];
  collaborators: CollaboratorWithProfile[];
  currency: string;
  currentUserId: string;
}

export const SettlementCard: React.FC<SettlementCardProps> = ({
  expenses,
  collaborators,
  currency,
  currentUserId,
}) => {
  const [expanded, setExpanded] = useState(false);

  const balances = useMemo(
    () => calculateBalances(expenses, collaborators),
    [expenses, collaborators],
  );

  const settlements = useMemo(
    () => calculateSettlements(balances),
    [balances],
  );

  if (balances.length === 0) return null;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => setExpanded(prev => !prev)}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Ausgleich</Text>
        <Text style={styles.toggleIcon}>{expanded ? '▲' : '▼'}</Text>
      </View>

      {/* Always show per-person balances */}
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
          <Text style={styles.settlementsTitle}>Ausgleichszahlungen</Text>
          {settlements.map((s, i) => (
            <View key={i} style={styles.settlementRow}>
              <Text style={styles.settlementText}>
                {s.fromName} → {s.toName}
              </Text>
              <Text style={styles.settlementAmount}>
                {s.amount.toFixed(2)} {currency}
              </Text>
            </View>
          ))}
        </View>
      )}

      {expanded && settlements.length === 0 && (
        <Text style={styles.settledText}>Alle Schulden sind ausgeglichen!</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: { ...typography.h3 },
  toggleIcon: { fontSize: 12, color: colors.textLight },
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
  },
  settlementsTitle: { ...typography.caption, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.sm },
  settlementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  settlementText: { ...typography.bodySmall, flex: 1 },
  settlementAmount: { ...typography.bodySmall, fontWeight: '700', color: colors.primary },
  settledText: { ...typography.bodySmall, color: colors.success, textAlign: 'center', marginTop: spacing.md },
});
