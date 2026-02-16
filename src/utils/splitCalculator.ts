import { Expense } from '../types/database';
import { CollaboratorWithProfile } from '../api/invitations';

export interface UserBalance {
  userId: string;
  name: string;
  paid: number;
  owes: number;
  balance: number; // positive = is owed money, negative = owes money
}

export interface Settlement {
  from: string; // userId
  fromName: string;
  to: string; // userId
  toName: string;
  amount: number;
}

/**
 * Calculate balances for all users from group expenses.
 * For each expense: the payer paid the full amount, and each person in split_with owes their share.
 */
export function calculateBalances(
  expenses: Expense[],
  collaborators: CollaboratorWithProfile[],
): UserBalance[] {
  const nameMap = new Map<string, string>();
  for (const c of collaborators) {
    const name = [c.profile.first_name, c.profile.last_name].filter(Boolean).join(' ') || c.profile.email;
    nameMap.set(c.user_id, name);
  }

  const paid = new Map<string, number>();
  const owes = new Map<string, number>();

  for (const exp of expenses) {
    if (!exp.paid_by || exp.split_with.length === 0) continue;

    // Add what the payer paid
    paid.set(exp.paid_by, (paid.get(exp.paid_by) || 0) + exp.amount);

    // Split equally among split_with members
    const share = exp.amount / exp.split_with.length;
    for (const userId of exp.split_with) {
      owes.set(userId, (owes.get(userId) || 0) + share);
    }
  }

  // Collect all user IDs that appear in any expense
  const allUserIds = new Set<string>();
  for (const exp of expenses) {
    if (exp.paid_by) allUserIds.add(exp.paid_by);
    for (const uid of exp.split_with) allUserIds.add(uid);
  }

  const balances: UserBalance[] = [];
  for (const userId of allUserIds) {
    const userPaid = paid.get(userId) || 0;
    const userOwes = owes.get(userId) || 0;
    balances.push({
      userId,
      name: nameMap.get(userId) || userId.slice(0, 8),
      paid: userPaid,
      owes: userOwes,
      balance: userPaid - userOwes,
    });
  }

  return balances.sort((a, b) => b.balance - a.balance);
}

/**
 * Minimize the number of transactions needed to settle all debts.
 * Greedy algorithm: match largest creditor with largest debtor.
 */
export function calculateSettlements(balances: UserBalance[]): Settlement[] {
  // Separate into creditors (positive balance) and debtors (negative balance)
  const creditors = balances
    .filter(b => b.balance > 0.01)
    .map(b => ({ ...b }))
    .sort((a, b) => b.balance - a.balance);

  const debtors = balances
    .filter(b => b.balance < -0.01)
    .map(b => ({ ...b, balance: Math.abs(b.balance) }))
    .sort((a, b) => b.balance - a.balance);

  const settlements: Settlement[] = [];

  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.balance, debtor.balance);

    if (amount > 0.01) {
      settlements.push({
        from: debtor.userId,
        fromName: debtor.name,
        to: creditor.userId,
        toName: creditor.name,
        amount: Math.round(amount * 100) / 100,
      });
    }

    creditor.balance -= amount;
    debtor.balance -= amount;

    if (creditor.balance < 0.01) ci++;
    if (debtor.balance < 0.01) di++;
  }

  return settlements;
}
