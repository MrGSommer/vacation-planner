import { supabase } from './supabase';
import { Trip } from '../types/database';

export const getTrips = async (userId: string): Promise<Trip[]> => {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .or(`owner_id.eq.${userId},id.in.(select trip_id from trip_collaborators where user_id='${userId}')`)
    .order('start_date', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const getTrip = async (tripId: string): Promise<Trip> => {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('id', tripId)
    .single();
  if (error) throw error;
  return data;
};

export const createTrip = async (trip: Omit<Trip, 'id' | 'created_at' | 'updated_at'>): Promise<Trip> => {
  const { data, error } = await supabase
    .from('trips')
    .insert(trip)
    .select()
    .single();
  if (error) throw error;

  // Add owner as collaborator
  await supabase.from('trip_collaborators').insert({
    trip_id: data.id,
    user_id: trip.owner_id,
    role: 'owner',
  });

  return data;
};

export const updateTrip = async (tripId: string, updates: Partial<Trip>): Promise<Trip> => {
  const { data, error } = await supabase
    .from('trips')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', tripId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteTrip = async (tripId: string): Promise<void> => {
  const { error } = await supabase.from('trips').delete().eq('id', tripId);
  if (error) throw error;
};
