import { supabase } from './supabase';
import { Trip } from '../types/database';
import { cachedQuery, invalidateCache } from '../utils/queryCache';

export const getTrips = async (userId: string): Promise<Trip[]> => {
  return cachedQuery(`trips:${userId}`, async () => {
    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .order('start_date', { ascending: false });
    if (error) throw error;
    return data || [];
  });
};

export const getTrip = async (tripId: string): Promise<Trip> => {
  return cachedQuery(`trip:${tripId}`, async () => {
    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .eq('id', tripId)
      .single();
    if (error) throw error;
    return data;
  });
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

  invalidateCache('trips:');
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
  invalidateCache('trips:');
  invalidateCache(`trip:${tripId}`);
  return data;
};

export const deleteTrip = async (tripId: string): Promise<void> => {
  const { error } = await supabase.from('trips').delete().eq('id', tripId);
  if (error) throw error;
  invalidateCache('trips:');
  invalidateCache(`trip:${tripId}`);
};

export const uploadCoverImage = async (tripId: string, uri: string): Promise<string> => {
  const path = `covers/${tripId}_${Date.now()}.jpg`;
  const response = await fetch(uri);
  const blob = await response.blob();

  const { error: uploadError } = await supabase.storage
    .from('trip-photos')
    .upload(path, blob, { contentType: 'image/jpeg' });
  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from('trip-photos')
    .getPublicUrl(path);

  await updateTrip(tripId, { cover_image_url: publicUrl });
  return publicUrl;
};
