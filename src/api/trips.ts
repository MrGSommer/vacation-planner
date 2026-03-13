import { supabase } from './supabase';
import { Trip } from '../types/database';
import { cachedQuery, invalidateCache } from '../utils/queryCache';
import { offlineMutation } from '../utils/offlineMutation';

export const getTrips = async (userId: string): Promise<Trip[]> => {
  return cachedQuery(`trips:${userId}`, async () => {
    // RLS now correctly filters to only trips user owns or collaborates on
    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .order('start_date', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Trip[];
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

const _createTrip = async (trip: Omit<Trip, 'id' | 'created_at' | 'updated_at'>): Promise<Trip> => {
  const { data: newTripId, error } = await supabase.rpc('create_trip_with_owner', {
    p_trip: trip,
    p_user_id: trip.owner_id,
  });
  if (error) throw error;

  invalidateCache('trips:');
  return getTrip(newTripId);
};

export const createTrip = async (trip: Omit<Trip, 'id' | 'created_at' | 'updated_at'>): Promise<Trip> => {
  return offlineMutation({
    operation: 'createTrip', table: 'trips', args: [trip], cacheKeys: ['trips:'],
    fn: _createTrip,
    optimisticResult: { ...trip, id: `temp_${Date.now()}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Trip,
  });
};

const _updateTrip = async (tripId: string, updates: Partial<Trip>): Promise<Trip> => {
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

export const updateTrip = async (tripId: string, updates: Partial<Trip>): Promise<Trip> => {
  return offlineMutation({
    operation: 'updateTrip', table: 'trips', args: [tripId, updates],
    cacheKeys: ['trips:', `trip:${tripId}`],
    fn: _updateTrip,
    optimisticResult: { id: tripId, ...updates, updated_at: new Date().toISOString() } as Trip,
  });
};

const _clearAllTripData = async (tripId: string, options: ClearTripOptions): Promise<void> => {
  const { data: photoPaths, error } = await supabase.rpc('clear_trip_data_cascade', {
    p_trip_id: tripId,
    p_options: options,
  });
  if (error) throw error;

  // Storage cleanup after successful DB cleanup (Storage has no transaction support)
  if (options.photos && photoPaths && photoPaths.length > 0) {
    await supabase.storage.from('trip-photos').remove(photoPaths);
  }
};

const _deleteTrip = async (tripId: string): Promise<void> => {
  const { data: photoPaths, error } = await supabase.rpc('delete_trip_cascade', {
    p_trip_id: tripId,
  });
  if (error) throw error;

  // Storage cleanup after successful DB cascade
  if (photoPaths && photoPaths.length > 0) {
    await supabase.storage.from('trip-photos').remove(photoPaths);
  }

  invalidateCache('trips:');
  invalidateCache(`trip:${tripId}`);
};

export const deleteTrip = async (tripId: string): Promise<void> => {
  return offlineMutation({
    operation: 'deleteTrip', table: 'trips', args: [tripId],
    cacheKeys: ['trips:', `trip:${tripId}`],
    fn: _deleteTrip,
  });
};

export interface ClearTripOptions {
  activities?: boolean;
  stops?: boolean;
  budget?: boolean;
  packing?: boolean;
  photos?: boolean;
  collaborators?: boolean;
  invitations?: boolean;
  ai?: boolean;
  logs?: boolean;
}

export const clearTripData = async (tripId: string, options: ClearTripOptions): Promise<void> => {
  await _clearAllTripData(tripId, options);
  invalidateCache(`trip:${tripId}`);
  invalidateCache(`activities:${tripId}`);
  invalidateCache('trips:');
};

export const duplicateTrip = async (tripId: string, userId: string): Promise<Trip> => {
  const { data: newTripId, error } = await supabase.rpc('duplicate_trip_atomic', {
    p_source_trip_id: tripId,
    p_user_id: userId,
  });
  if (error) throw error;

  invalidateCache('trips:');
  return getTrip(newTripId);
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
