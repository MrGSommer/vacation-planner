import { supabase } from './supabase';
import { Receipt, ReceiptItem, Expense } from '../types/database';

export const getReceipts = async (tripId: string): Promise<Receipt[]> => {
  const { data, error } = await supabase
    .from('receipts')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const createReceipt = async (
  receipt: Omit<Receipt, 'id' | 'created_at' | 'updated_at'>
): Promise<Receipt> => {
  const { data, error } = await supabase
    .from('receipts')
    .insert(receipt)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateReceipt = async (
  id: string,
  updates: Partial<Pick<Receipt, 'items' | 'status' | 'paid_by' | 'category_id' | 'restaurant_name' | 'date' | 'tip' | 'total' | 'subtotal' | 'tax'>>
): Promise<Receipt> => {
  const { data, error } = await supabase
    .from('receipts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteReceipt = async (id: string): Promise<void> => {
  const { error } = await supabase.from('receipts').delete().eq('id', id);
  if (error) throw error;
};

export const deleteExpensesByReceiptId = async (receiptId: string): Promise<void> => {
  const { error } = await supabase.from('expenses').delete().eq('receipt_id', receiptId);
  if (error) throw error;
};

export const generateExpensesFromReceipt = async (
  receipt: Receipt,
  userId: string,
): Promise<void> => {
  // Delete existing expenses for this receipt (idempotent re-generation)
  await deleteExpensesByReceiptId(receipt.id);

  if (!receipt.paid_by) return;

  const expensesToCreate: Array<Omit<Expense, 'id' | 'created_at' | 'budget_categories'>> = [];

  for (const item of receipt.items) {
    if (item.assigned_to.length === 0) continue;

    expensesToCreate.push({
      trip_id: receipt.trip_id,
      category_id: receipt.category_id || '',
      user_id: userId,
      description: item.name + (item.is_tip ? ' (Trinkgeld)' : ''),
      amount: item.total_price,
      currency: receipt.currency,
      date: receipt.date || new Date().toISOString().split('T')[0],
      scope: 'group',
      paid_by: receipt.paid_by,
      split_with: item.assigned_to.map(a => a.user_id),
      visible_to: [],
      creator_name: null,
      receipt_id: receipt.id,
    });
  }

  if (expensesToCreate.length === 0) return;

  const { error } = await supabase.from('expenses').insert(expensesToCreate);
  if (error) throw error;
};

export const uploadReceiptImage = async (
  tripId: string,
  imageBlob: Blob,
  fileName: string,
): Promise<string> => {
  const path = `${tripId}/receipts/${fileName}`;
  const { error: uploadError } = await supabase.storage
    .from('trip-photos')
    .upload(path, imageBlob, { contentType: 'image/jpeg' });
  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from('trip-photos')
    .getPublicUrl(path);

  return publicUrl;
};
