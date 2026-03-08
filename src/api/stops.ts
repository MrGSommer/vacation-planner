import { supabase } from './supabase';
import { TripStop } from '../types/database';
import { cachedQuery, invalidateCache } from '../utils/queryCache';
import { offlineMutation } from '../utils/offlineMutation';

export const getStops = async (tripId: string): Promise<TripStop[]> => {
  return cachedQuery(`stops:${tripId}`, async () => {
    const { data, error } = await supabase
      .from('trip_stops')
      .select('*')
      .eq('trip_id', tripId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  });
};

const _createStop = async (stop: Omit<TripStop, 'id' | 'created_at'>): Promise<TripStop> => {
  const { data, error } = await supabase
    .from('trip_stops')
    .insert(stop)
    .select()
    .single();
  if (error) throw error;
  invalidateCache(`stops:${stop.trip_id}`);
  return data;
};

export const createStop = async (stop: Omit<TripStop, 'id' | 'created_at'>): Promise<TripStop> => {
  return offlineMutation({
    operation: 'createStop', table: 'trip_stops', args: [stop], cacheKeys: [`stops:${stop.trip_id}`],
    fn: _createStop,
    optimisticResult: { ...stop, id: `temp_${Date.now()}`, created_at: new Date().toISOString() } as TripStop,
  });
};

const _updateStop = async (id: string, updates: Partial<TripStop>): Promise<TripStop> => {
  const { data, error } = await supabase
    .from('trip_stops')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateStop = async (id: string, updates: Partial<TripStop>): Promise<TripStop> => {
  return offlineMutation({
    operation: 'updateStop', table: 'trip_stops', args: [id, updates], cacheKeys: [],
    fn: _updateStop,
    optimisticResult: { id, ...updates } as TripStop,
  });
};

const _deleteStop = async (id: string): Promise<void> => {
  const { error } = await supabase.from('trip_stops').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('stops:');
};

export const deleteStop = async (id: string): Promise<void> => {
  return offlineMutation({
    operation: 'deleteStop', table: 'trip_stops', args: [id], cacheKeys: ['stops:'],
    fn: _deleteStop,
  });
};

export const reorderStops = async (tripId: string, orderedIds: string[]): Promise<void> => {
  const updates = orderedIds.map((id, index) =>
    supabase.from('trip_stops').update({ sort_order: index }).eq('id', id)
  );
  await Promise.all(updates);
};
