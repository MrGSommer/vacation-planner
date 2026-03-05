import { supabase } from './supabase';
import { BudgetCategory, Expense } from '../types/database';

export const getBudgetCategories = async (
  tripId: string
): Promise<BudgetCategory[]> => {
  const { data, error } = await supabase
    .from('budget_categories')
    .select('*')
    .eq('trip_id', tripId)
    .order('name');
  if (error) throw error;
  return data || [];
};

export const createBudgetCategory = async (
  tripId: string,
  name: string,
  color: string,
  budgetLimit: number | null
): Promise<BudgetCategory> => {
  const { data, error } = await supabase
    .from('budget_categories')
    .insert({
      trip_id: tripId,
      name,
      color,
      budget_limit: budgetLimit,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateBudgetCategory = async (
  id: string,
  updates: Partial<Pick<BudgetCategory, 'name' | 'color' | 'budget_limit'>>
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

export const deleteBudgetCategory = async (id: string): Promise<void> => {
  const { error } = await supabase.from('budget_categories').delete().eq('id', id);
  if (error) throw error;
};

export const getExpenses = async (
  tripId: string
): Promise<Expense[]> => {
  const { data, error } = await supabase
    .from('expenses')
    .select('*, budget_categories(name, color)')
    .eq('trip_id', tripId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const createExpense = async (
  expense: Omit<Expense, 'id' | 'created_at' | 'budget_categories' | 'receipt_id' | 'creator_name'> & { receipt_id?: string | null; creator_name?: string | null }
): Promise<Expense> => {
  const { data, error } = await supabase
    .from('expenses')
    .insert(expense)
    .select('*, budget_categories(name, color)')
    .single();
  if (error) throw error;
  return data;
};

export const updateExpense = async (
  id: string,
  updates: Partial<Omit<Expense, 'id' | 'created_at' | 'budget_categories'>>
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

export const deleteExpense = async (id: string): Promise<void> => {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
};

export const getTripExpenseTotal = async (tripId: string): Promise<number> => {
  const { data, error } = await supabase
    .from('expenses')
    .select('amount')
    .eq('trip_id', tripId);
  if (error) throw error;
  return (data || []).reduce((sum, e) => sum + e.amount, 0);
};
