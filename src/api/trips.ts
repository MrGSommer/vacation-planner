import { supabase } from './supabase';
import { Trip } from '../types/database';
import { cachedQuery, invalidateCache } from '../utils/queryCache';

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

export const duplicateTrip = async (tripId: string, userId: string): Promise<Trip> => {
  // 1. Fetch original trip
  const original = await getTrip(tripId);

  // 2. Create new trip (copy)
  const newTrip = await createTrip({
    owner_id: userId,
    name: `${original.name} (Kopie)`,
    destination: original.destination,
    destination_lat: original.destination_lat,
    destination_lng: original.destination_lng,
    cover_image_url: original.cover_image_url,
    cover_image_attribution: original.cover_image_attribution,
    theme_color: original.theme_color,
    start_date: original.start_date,
    end_date: original.end_date,
    status: 'planning',
    currency: original.currency,
    travelers_count: original.travelers_count,
    group_type: original.group_type,
    notes: original.notes,
    fable_enabled: original.fable_enabled,
    fable_budget_visible: original.fable_budget_visible,
    fable_packing_visible: original.fable_packing_visible,
    fable_stops_visible: original.fable_stops_visible,
    fable_personality: original.fable_personality,
    fable_detail_level: original.fable_detail_level,
    fable_creativity: original.fable_creativity,
    fable_language: original.fable_language,
  } as any);

  // 3. Copy days + activities
  const { data: days } = await supabase.from('itinerary_days').select('*').eq('trip_id', tripId).order('date');
  if (days) {
    for (const day of days) {
      const { data: newDay } = await supabase.from('itinerary_days')
        .insert({ trip_id: newTrip.id, date: day.date })
        .select().single();
      if (!newDay) continue;

      const { data: acts } = await supabase.from('activities').select('*').eq('day_id', day.id).order('sort_order');
      if (acts && acts.length > 0) {
        await supabase.from('activities').insert(
          acts.map(a => ({
            day_id: newDay.id,
            trip_id: newTrip.id,
            title: a.title,
            description: a.description,
            category: a.category,
            start_time: a.start_time,
            end_time: a.end_time,
            location_name: a.location_name,
            location_lat: a.location_lat,
            location_lng: a.location_lng,
            location_address: a.location_address,
            cost: a.cost,
            currency: a.currency,
            sort_order: a.sort_order,
            check_in_date: a.check_in_date,
            check_out_date: a.check_out_date,
            category_data: a.category_data,
          })),
        );
      }
    }
  }

  // 4. Copy stops
  const { data: stops } = await supabase.from('trip_stops').select('*').eq('trip_id', tripId).order('sort_order');
  if (stops && stops.length > 0) {
    await supabase.from('trip_stops').insert(
      stops.map(s => ({
        trip_id: newTrip.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        address: s.address,
        type: s.type,
        nights: s.nights,
        arrival_date: s.arrival_date,
        departure_date: s.departure_date,
        sort_order: s.sort_order,
        notes: s.notes,
      })),
    );
  }

  // 5. Copy budget categories
  const { data: cats } = await supabase.from('budget_categories').select('*').eq('trip_id', tripId);
  if (cats && cats.length > 0) {
    await supabase.from('budget_categories').insert(
      cats.map(c => ({
        trip_id: newTrip.id,
        name: c.name,
        color: c.color,
        budget_limit: c.budget_limit,
      })),
    );
  }

  invalidateCache('trips:');
  return newTrip;
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
