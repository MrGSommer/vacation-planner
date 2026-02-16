import { useState, useCallback, useEffect, useMemo } from 'react';
import { BudgetCategory, Expense } from '../types/database';
import * as budgetApi from '../api/budgets';
import { useAuthContext } from '../contexts/AuthContext';
import { useRealtime, RealtimePayload } from './useRealtime';

export const useBudget = (tripId: string, scope: 'group' | 'personal' = 'group') => {
  const { user } = useAuthContext();
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, exps] = await Promise.all([
        budgetApi.getBudgetCategories(tripId, scope),
        budgetApi.getExpenses(tripId, scope),
      ]);
      setCategories(cats);
      setExpenses(exps);
    } catch (e) {
      console.error('Budget-Fehler:', e);
    } finally {
      setLoading(false);
    }
  }, [tripId, scope]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime for expenses
  const handleExpenseRealtime = useCallback((payload?: RealtimePayload) => {
    if (!payload) { fetchData(); return; }
    const { eventType } = payload;
    const record = (payload.new || payload.old) as any;
    // Only handle events matching our current scope
    if (record?.scope !== scope) return;
    if (eventType === 'INSERT' && payload.new) {
      setExpenses(prev => [payload.new as unknown as Expense, ...prev]);
    } else if (eventType === 'UPDATE' && payload.new) {
      const updated = payload.new as unknown as Expense;
      setExpenses(prev => prev.map(e => e.id === updated.id ? updated : e));
    } else if (eventType === 'DELETE' && payload.old) {
      const deletedId = (payload.old as any).id;
      setExpenses(prev => prev.filter(e => e.id !== deletedId));
    } else {
      fetchData();
    }
  }, [fetchData, scope]);

  useRealtime('expenses', `trip_id=eq.${tripId}`, handleExpenseRealtime);

  // Realtime for budget_categories
  const handleCategoryRealtime = useCallback((payload?: RealtimePayload) => {
    if (!payload) { fetchData(); return; }
    const { eventType } = payload;
    const record = (payload.new || payload.old) as any;
    if (record?.scope !== scope) return;
    if (eventType === 'INSERT' && payload.new) {
      setCategories(prev => [...prev, payload.new as unknown as BudgetCategory]);
    } else if (eventType === 'UPDATE' && payload.new) {
      const updated = payload.new as unknown as BudgetCategory;
      setCategories(prev => prev.map(c => c.id === updated.id ? updated : c));
    } else if (eventType === 'DELETE' && payload.old) {
      const deletedId = (payload.old as any).id;
      setCategories(prev => prev.filter(c => c.id !== deletedId));
    } else {
      fetchData();
    }
  }, [fetchData, scope]);

  useRealtime('budget_categories', `trip_id=eq.${tripId}`, handleCategoryRealtime);

  // Category CRUD
  const addCategory = useCallback(async (name: string, color: string, budgetLimit?: number) => {
    if (!user) return;
    const created = await budgetApi.createBudgetCategory(
      tripId, name, color, budgetLimit ?? null, scope, user.id
    );
    setCategories(prev => [...prev, created]);
  }, [tripId, scope, user]);

  const updateCategory = useCallback(async (
    id: string,
    updates: Partial<Pick<BudgetCategory, 'name' | 'color' | 'budget_limit'>>
  ) => {
    const updated = await budgetApi.updateBudgetCategory(id, updates);
    setCategories(prev => prev.map(c => c.id === id ? updated : c));
  }, []);

  const removeCategory = useCallback(async (id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id));
    await budgetApi.deleteBudgetCategory(id);
  }, []);

  // Expense CRUD
  const addExpense = useCallback(async (
    expense: Omit<Expense, 'id' | 'created_at' | 'user_id' | 'scope' | 'budget_categories'>
  ) => {
    if (!user) return;
    const created = await budgetApi.createExpense({
      ...expense,
      user_id: user.id,
      scope,
      paid_by: scope === 'group' ? (expense.paid_by || user.id) : null,
      split_with: scope === 'group' ? (expense.split_with || []) : [],
    });
    setExpenses(prev => [created, ...prev]);
  }, [user, scope]);

  const updateExpense = useCallback(async (
    id: string,
    updates: Partial<Omit<Expense, 'id' | 'created_at' | 'budget_categories'>>
  ) => {
    const updated = await budgetApi.updateExpense(id, updates);
    setExpenses(prev => prev.map(e => e.id === id ? updated : e));
  }, []);

  const removeExpense = useCallback(async (id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
    await budgetApi.deleteExpense(id);
  }, []);

  const upgradeExpenseToGroup = useCallback(async (
    id: string, paidBy: string, splitWith: string[]
  ) => {
    const updated = await budgetApi.upgradeToGroup(id, paidBy, splitWith);
    // Remove from personal list (it's now group scope)
    setExpenses(prev => prev.filter(e => e.id !== id));
    return updated;
  }, []);

  const total = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);

  const totalBudget = useMemo(
    () => categories.reduce((sum, c) => sum + (c.budget_limit || 0), 0),
    [categories]
  );

  const byCategory = useMemo(() => categories.map(cat => ({
    ...cat,
    spent: expenses.filter(e => e.category_id === cat.id).reduce((sum, e) => sum + e.amount, 0),
  })), [categories, expenses]);

  return {
    categories,
    expenses,
    loading,
    total,
    totalBudget,
    byCategory,
    addCategory,
    updateCategory,
    removeCategory,
    addExpense,
    updateExpense,
    removeExpense,
    upgradeExpenseToGroup,
    refresh: fetchData,
  };
};
