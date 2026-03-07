import { supabase } from './supabase';
import { ItineraryDay, Activity } from '../types/database';
import { cachedQuery, invalidateCache } from '../utils/queryCache';
import { offlineMutation } from '../utils/offlineMutation';

export const getDays = async (tripId: string): Promise<ItineraryDay[]> => {
  const { data, error } = await supabase
    .from('itinerary_days')
    .select('*')
    .eq('trip_id', tripId)
    .order('date');
  if (error) throw error;
  return data || [];
};

const _createDay = async (tripId: string, date: string): Promise<ItineraryDay> => {
  const { data, error } = await supabase
    .from('itinerary_days')
    .insert({ trip_id: tripId, date })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const createDay = async (tripId: string, date: string): Promise<ItineraryDay> => {
  return offlineMutation({
    operation: 'createDay', table: 'itinerary_days', args: [tripId, date],
    cacheKeys: [`activities:${tripId}`],
    fn: _createDay,
    optimisticResult: { id: `temp_${Date.now()}`, trip_id: tripId, date, created_at: new Date().toISOString() } as ItineraryDay,
  });
};

export const getActivities = async (dayId: string): Promise<Activity[]> => {
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('day_id', dayId)
    .order('start_time', { ascending: true, nullsFirst: false })
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const getActivitiesForTrip = async (tripId: string): Promise<Activity[]> => {
  return cachedQuery(`activities:${tripId}`, async () => {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('trip_id', tripId)
      .order('start_time', { ascending: true, nullsFirst: false })
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  });
};

const _createActivity = async (activity: Omit<Activity, 'id' | 'created_at' | 'updated_at'>): Promise<Activity> => {
  const { data, error } = await supabase
    .from('activities')
    .insert(activity)
    .select()
    .single();
  if (error) throw error;
  invalidateCache(`activities:${activity.trip_id}`);
  return data;
};

export const createActivity = async (activity: Omit<Activity, 'id' | 'created_at' | 'updated_at'>): Promise<Activity> => {
  return offlineMutation({
    operation: 'createActivity', table: 'activities', args: [activity],
    cacheKeys: [`activities:${activity.trip_id}`],
    fn: _createActivity,
    optimisticResult: { ...activity, id: `temp_${Date.now()}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Activity,
  });
};

const _updateActivity = async (id: string, updates: Partial<Activity>): Promise<Activity> => {
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

export const updateActivity = async (id: string, updates: Partial<Activity>): Promise<Activity> => {
  return offlineMutation({
    operation: 'updateActivity', table: 'activities', args: [id, updates],
    cacheKeys: ['activities:'],
    fn: _updateActivity,
    optimisticResult: { id, ...updates, updated_at: new Date().toISOString() } as Activity,
  });
};

const _deleteActivity = async (id: string): Promise<void> => {
  const { error } = await supabase.from('activities').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('activities:');
};

export const deleteActivity = async (id: string): Promise<void> => {
  return offlineMutation({
    operation: 'deleteActivity', table: 'activities', args: [id],
    cacheKeys: ['activities:'],
    fn: _deleteActivity,
  });
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

const _deleteDay = async (dayId: string): Promise<void> => {
  const { error } = await supabase.from('itinerary_days').delete().eq('id', dayId);
  if (error) throw error;
};

export const deleteDay = async (dayId: string): Promise<void> => {
  return offlineMutation({
    operation: 'deleteDay', table: 'itinerary_days', args: [dayId],
    cacheKeys: ['activities:'],
    fn: _deleteDay,
  });
};

export const moveActivitiesToDay = async (activityIds: string[], newDayId: string): Promise<void> => {
  const { error } = await supabase.from('activities').update({ day_id: newDayId }).in('id', activityIds);
  if (error) throw error;
};
