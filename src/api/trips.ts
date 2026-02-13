import { supabase } from './supabase';
import { Trip } from '../types/database';
import { cachedQuery, invalidateCache } from '../utils/queryCache';

export const getTrips = async (userId: string): Promise<Trip[]> => {
  return cachedQuery(`trips:${userId}`, async () => {
    // Inner join with trip_collaborators to only return trips the user participates in.
    // Without this filter, admin users would see ALL trips due to RLS admin bypass.
    const { data, error } = await supabase
      .from('trips')
      .select('*, trip_collaborators!inner(user_id)')
      .eq('trip_collaborators.user_id', userId)
      .order('start_date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(({ trip_collaborators, ...trip }: any) => trip) as Trip[];
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

export interface ClearTripOptions {
  activities: boolean;
  stops: boolean;
  budget: boolean;
  packing: boolean;
  photos: boolean;
}

export const clearTripData = async (tripId: string, options: ClearTripOptions): Promise<void> => {
  const promises: Promise<any>[] = [];

  if (options.activities) {
    promises.push((async () => {
      const { error: e1 } = await supabase.from('activities').delete().eq('trip_id', tripId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('itinerary_days').delete().eq('trip_id', tripId);
      if (e2) throw e2;
    })());
  }

  if (options.stops) {
    promises.push((async () => {
      const { error } = await supabase.from('trip_stops').delete().eq('trip_id', tripId);
      if (error) throw error;
    })());
  }

  if (options.budget) {
    promises.push((async () => {
      const { error: e1 } = await supabase.from('expenses').delete().eq('trip_id', tripId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('budget_categories').delete().eq('trip_id', tripId);
      if (e2) throw e2;
    })());
  }

  if (options.packing) {
    promises.push((async () => {
      const { data } = await supabase.from('packing_lists').select('id').eq('trip_id', tripId);
      if (data && data.length > 0) {
        const ids = data.map(l => l.id);
        const { error: e1 } = await supabase.from('packing_items').delete().in('list_id', ids);
        if (e1) throw e1;
        const { error: e2 } = await supabase.from('packing_lists').delete().eq('trip_id', tripId);
        if (e2) throw e2;
      }
    })());
  }

  if (options.photos) {
    promises.push((async () => {
      const { data } = await supabase.from('photos').select('id, storage_path').eq('trip_id', tripId);
      if (data && data.length > 0) {
        const paths = data.map(p => p.storage_path).filter(Boolean);
        if (paths.length > 0) {
          await supabase.storage.from('trip-photos').remove(paths);
        }
        const { error } = await supabase.from('photos').delete().eq('trip_id', tripId);
        if (error) throw error;
      }
    })());
  }

  await Promise.all(promises);

  invalidateCache(`trip:${tripId}`);
  invalidateCache(`activities:${tripId}`);
  invalidateCache('trips:');
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
