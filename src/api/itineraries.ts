import { supabase } from './supabase';
import { ItineraryDay, Activity } from '../types/database';
import { cachedQuery, invalidateCache } from '../utils/queryCache';

export const getDays = async (tripId: string): Promise<ItineraryDay[]> => {
  const { data, error } = await supabase
    .from('itinerary_days')
    .select('*')
    .eq('trip_id', tripId)
    .order('date');
  if (error) throw error;
  return data || [];
};

export const createDay = async (tripId: string, date: string): Promise<ItineraryDay> => {
  const { data, error } = await supabase
    .from('itinerary_days')
    .insert({ trip_id: tripId, date })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getActivities = async (dayId: string): Promise<Activity[]> => {
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('day_id', dayId)
    .order('sort_order');
  if (error) throw error;
  return data || [];
};

export const getActivitiesForTrip = async (tripId: string): Promise<Activity[]> => {
  return cachedQuery(`activities:${tripId}`, async () => {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('trip_id', tripId)
      .order('sort_order');
    if (error) throw error;
    return data || [];
  });
};

export const createActivity = async (activity: Omit<Activity, 'id' | 'created_at' | 'updated_at'>): Promise<Activity> => {
  const { data, error } = await supabase
    .from('activities')
    .insert(activity)
    .select()
    .single();
  if (error) throw error;
  invalidateCache(`activities:${activity.trip_id}`);
  return data;
};

export const updateActivity = async (id: string, updates: Partial<Activity>): Promise<Activity> => {
  const { data, error } = await supabase
    .from('activities')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  if (data.trip_id) invalidateCache(`activities:${data.trip_id}`);
  return data;
};

export const deleteActivity = async (id: string): Promise<void> => {
  const { error } = await supabase.from('activities').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('activities:');
};

export const createActivities = async (activities: Omit<Activity, 'id' | 'created_at' | 'updated_at'>[]): Promise<Activity[]> => {
  if (activities.length === 0) return [];
  const { data, error } = await supabase
    .from('activities')
    .insert(activities)
    .select();
  if (error) throw error;
  if (activities.length > 0) invalidateCache(`activities:${activities[0].trip_id}`);
  return data || [];
};

export const deleteDay = async (dayId: string): Promise<void> => {
  const { error } = await supabase.from('itinerary_days').delete().eq('id', dayId);
  if (error) throw error;
};

export const moveActivitiesToDay = async (activityIds: string[], newDayId: string): Promise<void> => {
  const { error } = await supabase.from('activities').update({ day_id: newDayId }).in('id', activityIds);
  if (error) throw error;
};
