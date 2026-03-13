import { supabase } from './supabase';
import { BudgetCategory, BudgetPersonalLimit, Expense } from '../types/database';
import { offlineMutation } from '../utils/offlineMutation';
import { cachedQuery, invalidateCache } from '../utils/queryCache';

export const getBudgetCategories = async (
  tripId: string,
  userId?: string,
): Promise<BudgetCategory[]> => {
  return cachedQuery(`budgetCats:${tripId}:${userId || ''}`, async () => {
    const { data, error } = await supabase
      .from('budget_categories')
      .select('*')
      .eq('trip_id', tripId)
      .order('name');
    if (error) throw error;

    let categories = (data || []) as BudgetCategory[];

    // Filter: show group categories + only own personal categories
    if (userId) {
      categories = categories.filter(
        c => c.scope === 'group' || c.user_id === userId
      );

      // Fetch personal limits for this user
      const catIds = categories.filter(c => c.scope === 'group').map(c => c.id);
      if (catIds.length > 0) {
        const { data: limits } = await supabase
          .from('budget_personal_limits')
          .select('*')
          .eq('user_id', userId)
          .in('category_id', catIds);
        if (limits) {
          const limitMap = new Map(limits.map(l => [l.category_id, l.budget_limit]));
          categories = categories.map(c => ({
            ...c,
            personal_limit: limitMap.get(c.id) ?? null,
          }));
        }
      }
    }

    return categories;
  });
};

const _createBudgetCategory = async (
  tripId: string, name: string, color: string, budgetLimit: number | null,
  scope: 'group' | 'personal' = 'group', userId?: string | null,
): Promise<BudgetCategory> => {
  const row: any = { trip_id: tripId, name, color, budget_limit: budgetLimit, scope };
  if (scope === 'personal' && userId) row.user_id = userId;
  const { data, error } = await supabase
    .from('budget_categories')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  invalidateCache(`budgetCats:${tripId}`);
  return data;
};

export const createBudgetCategory = async (
  tripId: string, name: string, color: string, budgetLimit: number | null,
  scope: 'group' | 'personal' = 'group', userId?: string | null,
): Promise<BudgetCategory> => {
  return offlineMutation({
    operation: 'createBudgetCategory', table: 'budget_categories',
    args: [tripId, name, color, budgetLimit, scope, userId], cacheKeys: [`budgetCats:${tripId}`],
    fn: _createBudgetCategory,
    optimisticResult: { id: `temp_${Date.now()}`, trip_id: tripId, name, color, budget_limit: budgetLimit, scope, user_id: userId || null, created_at: new Date().toISOString() } as BudgetCategory,
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

// --- Personal limits on group categories ---

export const setPersonalLimit = async (
  categoryId: string, userId: string, budgetLimit: number, tripId: string,
): Promise<BudgetPersonalLimit> => {
  const { data, error } = await supabase
    .from('budget_personal_limits')
    .upsert({ category_id: categoryId, user_id: userId, budget_limit: budgetLimit }, { onConflict: 'category_id,user_id' })
    .select()
    .single();
  if (error) throw error;
  invalidateCache(`budgetCats:${tripId}`);
  return data;
};

export const removePersonalLimit = async (
  categoryId: string, userId: string, tripId: string,
): Promise<void> => {
  const { error } = await supabase
    .from('budget_personal_limits')
    .delete()
    .eq('category_id', categoryId)
    .eq('user_id', userId);
  if (error) throw error;
  invalidateCache(`budgetCats:${tripId}`);
};

// --- Expenses ---

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
