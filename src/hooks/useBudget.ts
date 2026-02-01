import { useState, useCallback, useEffect } from 'react';
import { BudgetCategory, Expense } from '../types/database';
import * as budgetApi from '../api/budgets';
import { useAuthContext } from '../contexts/AuthContext';
import { useRealtime } from './useRealtime';

export const useBudget = (tripId: string) => {
  const { user } = useAuthContext();
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);

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
  useRealtime('expenses', `trip_id=eq.${tripId}`, fetchData);

  const addExpense = useCallback(async (expense: Omit<Expense, 'id' | 'created_at' | 'user_id'>) => {
    if (!user) return;
    await budgetApi.createExpense({ ...expense, user_id: user.id });
    await fetchData();
  }, [user, fetchData]);

  const removeExpense = useCallback(async (id: string) => {
    await budgetApi.deleteExpense(id);
    await fetchData();
  }, [fetchData]);

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  const byCategory = categories.map(cat => ({
    ...cat,
    total: expenses.filter(e => e.category_id === cat.id).reduce((sum, e) => sum + e.amount, 0),
  }));

  return { categories, expenses, loading, total, byCategory, addExpense, removeExpense, refresh: fetchData };
};
