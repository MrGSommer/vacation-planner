import { supabase } from './supabase';
import { PackingList, PackingItem } from '../types/database';

export const getPackingLists = async (tripId: string): Promise<PackingList[]> => {
  const { data, error } = await supabase
    .from('packing_lists')
    .select('*')
    .eq('trip_id', tripId);
  if (error) throw error;
  return data || [];
};

export const createPackingList = async (tripId: string, name: string): Promise<PackingList> => {
  const { data, error } = await supabase
    .from('packing_lists')
    .insert({ trip_id: tripId, name })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getPackingItems = async (listId: string): Promise<PackingItem[]> => {
  const { data, error } = await supabase
    .from('packing_items')
    .select('*')
    .eq('list_id', listId)
    .order('category')
    .order('name');
  if (error) throw error;
  return data || [];
};

export const createPackingItem = async (
  listId: string,
  name: string,
  category: string,
  quantity: number = 1
): Promise<PackingItem> => {
  const { data, error } = await supabase
    .from('packing_items')
    .insert({ list_id: listId, name, category, quantity, is_packed: false })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const createPackingItems = async (
  listId: string,
  items: { name: string; category: string; quantity: number }[],
): Promise<PackingItem[]> => {
  const rows = items.map(item => ({
    list_id: listId,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    is_packed: false,
  }));
  const { data, error } = await supabase
    .from('packing_items')
    .insert(rows)
    .select();
  if (error) throw error;
  return data || [];
};

export const togglePackingItem = async (id: string, isPacked: boolean): Promise<PackingItem> => {
  const { data, error } = await supabase
    .from('packing_items')
    .update({ is_packed: isPacked })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const togglePackingItems = async (ids: string[], isPacked: boolean): Promise<void> => {
  const { error } = await supabase
    .from('packing_items')
    .update({ is_packed: isPacked })
    .in('id', ids);
  if (error) throw error;
};

export const deletePackingItem = async (id: string): Promise<void> => {
  const { error } = await supabase.from('packing_items').delete().eq('id', id);
  if (error) throw error;
};

export const deletePackingItems = async (ids: string[]): Promise<void> => {
  const { error } = await supabase.from('packing_items').delete().in('id', ids);
  if (error) throw error;
};

export const updatePackingItemAssignment = async (
  id: string,
  userId: string | null,
): Promise<PackingItem> => {
  const { data, error } = await supabase
    .from('packing_items')
    .update({ assigned_to: userId })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};
