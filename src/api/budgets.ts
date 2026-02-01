import { supabase } from './supabase';
import { BudgetCategory, Expense } from '../types/database';

export const getBudgetCategories = async (tripId: string): Promise<BudgetCategory[]> => {
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
  budgetLimit?: number
): Promise<BudgetCategory> => {
  const { data, error } = await supabase
    .from('budget_categories')
    .insert({ trip_id: tripId, name, color, budget_limit: budgetLimit || null })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getExpenses = async (tripId: string): Promise<Expense[]> => {
  const { data, error } = await supabase
    .from('expenses')
    .select('*, budget_categories(name, color)')
    .eq('trip_id', tripId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const createExpense = async (expense: Omit<Expense, 'id' | 'created_at'>): Promise<Expense> => {
  const { data, error } = await supabase
    .from('expenses')
    .insert(expense)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateExpense = async (id: string, updates: Partial<Expense>): Promise<Expense> => {
  const { data, error } = await supabase
    .from('expenses')
    .update(updates)
    .eq('id', id)
    .select()
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
