import { supabase } from './supabase';
import { BudgetCategory, Expense } from '../types/database';

export const getBudgetCategories = async (
  tripId: string,
  scope?: 'group' | 'personal'
): Promise<BudgetCategory[]> => {
  let query = supabase
    .from('budget_categories')
    .select('*')
    .eq('trip_id', tripId)
    .order('name');
  if (scope) query = query.eq('scope', scope);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

export const createBudgetCategory = async (
  tripId: string,
  name: string,
  color: string,
  budgetLimit: number | null,
  scope: 'group' | 'personal',
  userId?: string
): Promise<BudgetCategory> => {
  const { data, error } = await supabase
    .from('budget_categories')
    .insert({
      trip_id: tripId,
      name,
      color,
      budget_limit: budgetLimit,
      scope,
      user_id: scope === 'personal' ? userId : null,
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
  tripId: string,
  scope?: 'group' | 'personal'
): Promise<Expense[]> => {
  let query = supabase
    .from('expenses')
    .select('*, budget_categories(name, color)')
    .eq('trip_id', tripId)
    .order('date', { ascending: false });
  if (scope) query = query.eq('scope', scope);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

export const createExpense = async (
  expense: Omit<Expense, 'id' | 'created_at' | 'budget_categories'>
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

export const upgradeToGroup = async (
  id: string,
  paidBy: string,
  splitWith: string[]
): Promise<Expense> => {
  const { data, error } = await supabase
    .from('expenses')
    .update({ scope: 'group', paid_by: paidBy, split_with: splitWith })
    .eq('id', id)
    .select('*, budget_categories(name, color)')
    .single();
  if (error) throw error;
  return data;
};

export const getTripExpenseTotal = async (tripId: string): Promise<number> => {
  const { data, error } = await supabase
    .from('expenses')
    .select('amount')
    .eq('trip_id', tripId);
  if (error) throw error;
  return (data || []).reduce((sum, e) => sum + e.amount, 0);
};
