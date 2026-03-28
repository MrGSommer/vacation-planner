import { supabase } from './supabase';
import { Activity } from '../types/database';
import { cachedQuery } from '../utils/queryCache';

/**
 * TripStop-compatible shape derived from activities with category='hotel'/'stop'.
 * Used by MapScreen, useWeather, TripPrintTab, etc.
 */
export interface StopLocation {
  id: string;
  trip_id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  type: 'overnight' | 'waypoint';
  nights: number | null;
  arrival_date: string | null;
  departure_date: string | null;
  sort_order: number;
}

/**
 * Returns hotel/stop activities as StopLocation objects.
 * Single source of truth — replaces the old trip_stops table query.
 */
export const getStopLocations = async (tripId: string): Promise<StopLocation[]> => {
  return cachedQuery(`stops:${tripId}`, async () => {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('trip_id', tripId)
      .in('category', ['hotel', 'stop'])
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data || [])
      .filter((a: Activity) => a.location_lat != null && a.location_lng != null)
      .map(activityToStopLocation);
  });
};

/** Map an Activity (hotel/stop) to a StopLocation. */
function activityToStopLocation(a: Activity): StopLocation {
  const cd = a.category_data || {};
  let nights: number | null = cd.nights ?? null;
  // Compute nights from check_in/check_out if not set
  if (nights == null && a.check_in_date && a.check_out_date) {
    const diff = (new Date(a.check_out_date).getTime() - new Date(a.check_in_date).getTime()) / (1000 * 60 * 60 * 24);
    if (diff > 0) nights = Math.round(diff);
  }
  return {
    id: a.id,
    trip_id: a.trip_id,
    name: a.location_name || a.title,
    address: a.location_address,
    lat: a.location_lat!,
    lng: a.location_lng!,
    type: a.category === 'hotel' ? 'overnight' : 'waypoint',
    nights,
    arrival_date: a.check_in_date,
    departure_date: a.check_out_date,
    sort_order: a.sort_order,
  };
}

// Legacy alias — use getStopLocations in new code
export const getStops = getStopLocations;
