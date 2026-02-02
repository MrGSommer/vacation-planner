import { useState, useCallback, useEffect } from 'react';
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

  const handleRealtime = useCallback((payload?: RealtimePayload) => {
    if (!payload) { fetchData(); return; }
    const { eventType } = payload;
    if (eventType === 'INSERT' && payload.new) {
      setExpenses(prev => [...prev, payload.new as unknown as Expense]);
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

  useRealtime('expenses', `trip_id=eq.${tripId}`, handleRealtime);

  const addExpense = useCallback(async (expense: Omit<Expense, 'id' | 'created_at' | 'user_id'>) => {
    if (!user) return;
    const created = await budgetApi.createExpense({ ...expense, user_id: user.id });
    setExpenses(prev => [...prev, created]);
  }, [user]);

  const removeExpense = useCallback(async (id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
    await budgetApi.deleteExpense(id);
  }, []);

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  const byCategory = categories.map(cat => ({
    ...cat,
    total: expenses.filter(e => e.category_id === cat.id).reduce((sum, e) => sum + e.amount, 0),
  }));

  return { categories, expenses, loading, total, byCategory, addExpense, removeExpense, refresh: fetchData };
};
