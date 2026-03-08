import { supabase } from './supabase';
import { BudgetCategory, Expense } from '../types/database';
import { offlineMutation } from '../utils/offlineMutation';
import { cachedQuery, invalidateCache } from '../utils/queryCache';

export const getBudgetCategories = async (
  tripId: string
): Promise<BudgetCategory[]> => {
  return cachedQuery(`budgetCats:${tripId}`, async () => {
    const { data, error } = await supabase
      .from('budget_categories')
      .select('*')
      .eq('trip_id', tripId)
      .order('name');
    if (error) throw error;
    return data || [];
  });
};

const _createBudgetCategory = async (
  tripId: string, name: string, color: string, budgetLimit: number | null
): Promise<BudgetCategory> => {
  const { data, error } = await supabase
    .from('budget_categories')
    .insert({ trip_id: tripId, name, color, budget_limit: budgetLimit })
    .select()
    .single();
  if (error) throw error;
  invalidateCache(`budgetCats:${tripId}`);
  return data;
};

export const createBudgetCategory = async (
  tripId: string, name: string, color: string, budgetLimit: number | null
): Promise<BudgetCategory> => {
  return offlineMutation({
    operation: 'createBudgetCategory', table: 'budget_categories',
    args: [tripId, name, color, budgetLimit], cacheKeys: [`budgetCats:${tripId}`],
    fn: _createBudgetCategory,
    optimisticResult: { id: `temp_${Date.now()}`, trip_id: tripId, name, color, budget_limit: budgetLimit, created_at: new Date().toISOString() } as BudgetCategory,
  });
};

const _updateBudgetCategory = async (
  id: string, updates: Partial<Pick<BudgetCategory, 'name' | 'color' | 'budget_limit'>>
): Promise<BudgetCategory> => {
  const { data, error } = await supabase
    .from('budget_categories')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateBudgetCategory = async (
  id: string, updates: Partial<Pick<BudgetCategory, 'name' | 'color' | 'budget_limit'>>
): Promise<BudgetCategory> => {
  return offlineMutation({
    operation: 'updateBudgetCategory', table: 'budget_categories',
    args: [id, updates], cacheKeys: [],
    fn: _updateBudgetCategory,
    optimisticResult: { id, ...updates } as BudgetCategory,
  });
};

const _deleteBudgetCategory = async (id: string): Promise<void> => {
  const { error } = await supabase.from('budget_categories').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('budgetCats:');
};

export const deleteBudgetCategory = async (id: string): Promise<void> => {
  return offlineMutation({
    operation: 'deleteBudgetCategory', table: 'budget_categories',
    args: [id], cacheKeys: ['budgetCats:'],
    fn: _deleteBudgetCategory,
  });
};

export const getExpenses = async (
  tripId: string
): Promise<Expense[]> => {
  return cachedQuery(`expenses:${tripId}`, async () => {
    const { data, error } = await supabase
      .from('expenses')
      .select('*, budget_categories(name, color)')
      .eq('trip_id', tripId)
      .order('date', { ascending: false });
    if (error) throw error;
    return data || [];
  });
};

const _createExpense = async (
  expense: Omit<Expense, 'id' | 'created_at' | 'budget_categories' | 'receipt_id' | 'creator_name'> & { receipt_id?: string | null; creator_name?: string | null }
): Promise<Expense> => {
  const { data, error } = await supabase
    .from('expenses')
    .insert(expense)
    .select('*, budget_categories(name, color)')
    .single();
  if (error) throw error;
  invalidateCache(`expenseTotal:${expense.trip_id}`);
  invalidateCache(`expenses:${expense.trip_id}`);
  return data;
};

export const createExpense = async (
  expense: Omit<Expense, 'id' | 'created_at' | 'budget_categories' | 'receipt_id' | 'creator_name'> & { receipt_id?: string | null; creator_name?: string | null }
): Promise<Expense> => {
  return offlineMutation({
    operation: 'createExpense', table: 'expenses', args: [expense], cacheKeys: [`expenses:${expense.trip_id}`, `expenseTotal:${expense.trip_id}`],
    fn: _createExpense,
    optimisticResult: { ...expense, id: `temp_${Date.now()}`, created_at: new Date().toISOString(), budget_categories: null } as any,
  });
};

const _updateExpense = async (
  id: string, updates: Partial<Omit<Expense, 'id' | 'created_at' | 'budget_categories'>>
): Promise<Expense> => {
  const { data, error } = await supabase
    .from('expenses')
    .update(updates)
    .eq('id', id)
    .select('*, budget_categories(name, color)')
    .single();
  if (error) throw error;
  return data;
};

export const updateExpense = async (
  id: string, updates: Partial<Omit<Expense, 'id' | 'created_at' | 'budget_categories'>>
): Promise<Expense> => {
  return offlineMutation({
    operation: 'updateExpense', table: 'expenses', args: [id, updates], cacheKeys: [],
    fn: _updateExpense,
    optimisticResult: { id, ...updates } as Expense,
  });
};

const _deleteExpense = async (id: string): Promise<void> => {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('expenseTotal:');
  invalidateCache('expenses:');
};

export const deleteExpense = async (id: string): Promise<void> => {
  return offlineMutation({
    operation: 'deleteExpense', table: 'expenses', args: [id], cacheKeys: ['expenses:', 'expenseTotal:'],
    fn: _deleteExpense,
  });
};

export const getTripExpenseTotal = async (tripId: string): Promise<number> => {
  return cachedQuery(`expenseTotal:${tripId}`, async () => {
    const { data, error } = await supabase
      .from('expenses')
      .select('amount')
      .eq('trip_id', tripId);
    if (error) throw error;
    return (data || []).reduce((sum, e) => sum + e.amount, 0);
  });
};
