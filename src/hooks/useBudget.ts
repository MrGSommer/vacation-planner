import { useState, useCallback, useEffect, useMemo } from 'react';
import { BudgetCategory, Expense } from '../types/database';
import * as budgetApi from '../api/budgets';
import { useAuthContext } from '../contexts/AuthContext';
import { useRealtime, RealtimePayload } from './useRealtime';

export const useBudget = (tripId: string) => {
  const { user } = useAuthContext();
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, exps] = await Promise.all([
        budgetApi.getBudgetCategories(tripId),
        budgetApi.getExpenses(tripId),
      ]);
      setCategories(cats);
      setExpenses(exps);
    } catch (e) {
      console.error('Budget-Fehler:', e);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime for expenses
  const handleExpenseRealtime = useCallback((payload?: RealtimePayload) => {
    if (!payload) { fetchData(); return; }
    const { eventType } = payload;
    if (eventType === 'INSERT' && payload.new) {
      const newExp = payload.new as unknown as Expense;
      setExpenses(prev => prev.some(e => e.id === newExp.id) ? prev : [newExp, ...prev]);
    } else if (eventType === 'UPDATE' && payload.new) {
      const updated = payload.new as unknown as Expense;
      setExpenses(prev => prev.map(e => e.id === updated.id ? updated : e));
    } else if (eventType === 'DELETE' && payload.old) {
      const deletedId = (payload.old as any).id;
      setExpenses(prev => prev.filter(e => e.id !== deletedId));
    } else {
      fetchData();
    }
  }, [fetchData]);

  useRealtime('expenses', `trip_id=eq.${tripId}`, handleExpenseRealtime);

  // Realtime for budget_categories
  const handleCategoryRealtime = useCallback((payload?: RealtimePayload) => {
    if (!payload) { fetchData(); return; }
    const { eventType } = payload;
    if (eventType === 'INSERT' && payload.new) {
      const newCat = payload.new as unknown as BudgetCategory;
      setCategories(prev => prev.some(c => c.id === newCat.id) ? prev : [...prev, newCat]);
    } else if (eventType === 'UPDATE' && payload.new) {
      const updated = payload.new as unknown as BudgetCategory;
      setCategories(prev => prev.map(c => c.id === updated.id ? updated : c));
    } else if (eventType === 'DELETE' && payload.old) {
      const deletedId = (payload.old as any).id;
      setCategories(prev => prev.filter(c => c.id !== deletedId));
    } else {
      fetchData();
    }
  }, [fetchData]);

  useRealtime('budget_categories', `trip_id=eq.${tripId}`, handleCategoryRealtime);

  // Category CRUD
  const addCategory = useCallback(async (name: string, color: string, budgetLimit?: number) => {
    if (!user) return;
    const created = await budgetApi.createBudgetCategory(
      tripId, name, color, budgetLimit ?? null
    );
    setCategories(prev => [...prev, created]);
  }, [tripId, user]);

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
    expense: Omit<Expense, 'id' | 'created_at' | 'user_id' | 'budget_categories' | 'receipt_id' | 'creator_name'> & {
      scope: 'group' | 'personal';
      visible_to: string[];
    }
  ) => {
    if (!user) return;
    const created = await budgetApi.createExpense({
      ...expense,
      user_id: user.id,
    });
    setExpenses(prev => [created, ...prev]);
  }, [user]);

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

  const total = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);

  const totalBudget = useMemo(
    () => categories.reduce((sum, c) => sum + (c.budget_limit || 0), 0),
    [categories]
  );

  const byCategory = useMemo(() => {
    const catIds = new Set(categories.map(c => c.id));
    const result = categories.map(cat => ({
      ...cat,
      spent: expenses.filter(e => e.category_id === cat.id).reduce((sum, e) => sum + e.amount, 0),
    }));
    // Add uncategorized bucket if there are expenses without valid category
    const uncategorizedSpent = expenses
      .filter(e => !e.category_id || !catIds.has(e.category_id))
      .reduce((sum, e) => sum + e.amount, 0);
    if (uncategorizedSpent > 0) {
      result.push({
        id: '__uncategorized__',
        trip_id: tripId,
        name: 'Unkategorisiert',
        color: '#9E9E9E',
        budget_limit: null,
        created_at: '',
        spent: uncategorizedSpent,
      });
    }
    return result;
  }, [categories, expenses, tripId]);

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
    refresh: fetchData,
  };
};
