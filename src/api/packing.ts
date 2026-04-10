import { supabase } from './supabase';
import { PackingList, PackingItem } from '../types/database';
import { cachedQuery, invalidateCache } from '../utils/queryCache';
import { offlineMutation } from '../utils/offlineMutation';

export const getPackingLists = async (tripId: string): Promise<PackingList[]> => {
  return cachedQuery(`packingLists:${tripId}`, async () => {
    const { data, error } = await supabase
      .from('packing_lists')
      .select('*')
      .eq('trip_id', tripId);
    if (error) throw error;
    return data || [];
  });
};

const _createPackingList = async (tripId: string, name: string): Promise<PackingList> => {
  const { data, error } = await supabase
    .from('packing_lists')
    .insert({ trip_id: tripId, name })
    .select()
    .single();
  if (error) throw error;
  invalidateCache(`packingLists:${tripId}`);
  return data;
};

export const createPackingList = async (tripId: string, name: string): Promise<PackingList> => {
  return offlineMutation({
    operation: 'createPackingList', table: 'packing_lists', args: [tripId, name], cacheKeys: [`packingLists:${tripId}`],
    fn: _createPackingList,
    optimisticResult: { id: `temp_${Date.now()}`, trip_id: tripId, name, created_at: new Date().toISOString() } as PackingList,
  });
};

export const getPackingItems = async (listId: string): Promise<PackingItem[]> => {
  return cachedQuery(`packingItems:${listId}`, async () => {
    const { data, error } = await supabase
      .from('packing_items')
      .select('*')
      .eq('list_id', listId)
      .order('category')
      .order('name');
    if (error) throw error;
    return data || [];
  });
};

const _createPackingItem = async (
  listId: string, name: string, category: string, quantity: number = 1
): Promise<PackingItem> => {
  const { data, error } = await supabase
    .from('packing_items')
    .insert({ list_id: listId, name, category, quantity, is_packed: false })
    .select()
    .single();
  if (error) throw error;
  invalidateCache(`packingItems:${listId}`);
  return data;
};

export const createPackingItem = async (
  listId: string, name: string, category: string, quantity: number = 1
): Promise<PackingItem> => {
  return offlineMutation({
    operation: 'createPackingItem', table: 'packing_items',
    args: [listId, name, category, quantity], cacheKeys: [`packingItems:${listId}`],
    fn: _createPackingItem,
    optimisticResult: { id: `temp_${Date.now()}`, list_id: listId, name, category, quantity, is_packed: false, created_at: new Date().toISOString() } as PackingItem,
  });
};

export const createPackingItems = async (
  listId: string,
  items: { name: string; category: string; quantity: number; assigned_to?: string | null }[],
): Promise<PackingItem[]> => {
  const rows = items.map(item => ({
    list_id: listId,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    is_packed: false,
    ...(item.assigned_to ? { assigned_to: item.assigned_to } : {}),
  }));
  const { data, error } = await supabase
    .from('packing_items')
    .insert(rows)
    .select();
  if (error) throw error;
  invalidateCache(`packingItems:${listId}`);
  return data || [];
};

const _togglePackingItem = async (id: string, isPacked: boolean): Promise<PackingItem> => {
  const { data, error } = await supabase
    .from('packing_items')
    .update({ is_packed: isPacked })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  invalidateCache('packingItems:');
  return data;
};

export const togglePackingItem = async (id: string, isPacked: boolean): Promise<PackingItem> => {
  return offlineMutation({
    operation: 'togglePackingItem', table: 'packing_items',
    args: [id, isPacked], cacheKeys: ['packingItems:'],
    fn: _togglePackingItem,
    optimisticResult: { id, is_packed: isPacked } as PackingItem,
  });
};

export const togglePackingItems = async (ids: string[], isPacked: boolean): Promise<void> => {
  const { error } = await supabase
    .from('packing_items')
    .update({ is_packed: isPacked })
    .in('id', ids);
  if (error) throw error;
};

const _deletePackingItem = async (id: string): Promise<void> => {
  const { error } = await supabase.from('packing_items').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('packingItems:');
};

export const deletePackingItem = async (id: string): Promise<void> => {
  return offlineMutation({
    operation: 'deletePackingItem', table: 'packing_items', args: [id], cacheKeys: ['packingItems:'],
    fn: _deletePackingItem,
  });
};

export const deletePackingItems = async (ids: string[]): Promise<void> => {
  const { error } = await supabase.from('packing_items').delete().in('id', ids);
  if (error) throw error;
};

const _updatePackingItem = async (
  id: string, fields: { name?: string; category?: string; quantity?: number }
): Promise<PackingItem> => {
  const { data, error } = await supabase
    .from('packing_items')
    .update(fields)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  invalidateCache('packingItems:');
  return data;
};

export const updatePackingItem = async (
  id: string, fields: { name?: string; category?: string; quantity?: number }
): Promise<PackingItem> => {
  return offlineMutation({
    operation: 'updatePackingItem', table: 'packing_items',
    args: [id, fields], cacheKeys: ['packingItems:'],
    fn: _updatePackingItem,
    optimisticResult: { id, ...fields } as PackingItem,
  });
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
  invalidateCache('packingItems:');
  return data;
};
