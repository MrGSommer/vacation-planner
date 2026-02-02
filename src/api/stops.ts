import { supabase } from './supabase';
import { TripStop } from '../types/database';

export const getStops = async (tripId: string): Promise<TripStop[]> => {
  const { data, error } = await supabase
    .from('trip_stops')
    .select('*')
    .eq('trip_id', tripId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const createStop = async (stop: Omit<TripStop, 'id' | 'created_at'>): Promise<TripStop> => {
  const { data, error } = await supabase
    .from('trip_stops')
    .insert(stop)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateStop = async (id: string, updates: Partial<TripStop>): Promise<TripStop> => {
  const { data, error } = await supabase
    .from('trip_stops')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteStop = async (id: string): Promise<void> => {
  const { error } = await supabase.from('trip_stops').delete().eq('id', id);
  if (error) throw error;
};

export const reorderStops = async (tripId: string, orderedIds: string[]): Promise<void> => {
  const updates = orderedIds.map((id, index) =>
    supabase.from('trip_stops').update({ sort_order: index }).eq('id', id)
  );
  await Promise.all(updates);
};
