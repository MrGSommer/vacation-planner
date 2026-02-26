import { useState, useEffect, useCallback, useRef } from 'react';
import { lookupFlight, FlightInfo, isValidFlightNumber } from '../utils/flightLookup';
import { Activity } from '../types/database';

// Refresh interval: 10 minutes for live tracking
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

// In-memory cache to avoid redundant API calls across re-renders
const flightCache = new Map<string, { data: FlightInfo; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min cache

/**
 * Determines if a trip is "trackable" — active or starting within 1 day.
 */
export function isTripTrackable(startDate: string, endDate: string): boolean {
  const now = new Date();
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T23:59:59');

  // Trip is active
  if (now >= start && now <= end) return true;

  // Trip starts within 1 day
  const oneDayBefore = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  if (now >= oneDayBefore && now < start) return true;

  return false;
}

/**
 * Extract flight number from a verified transport activity's category_data.
 * Only returns a flight number if the activity was verified via API (flight_verified=true).
 */
export function getFlightNumber(activity: Activity): string | null {
  if (activity.category !== 'transport') return null;
  const catData = activity.category_data || {};
  if (catData.transport_type !== 'Flug') return null;
  if (!catData.flight_verified) return null; // Only track API-verified flights
  // Prefer stored flight_iata (normalized), fallback to reference_number
  const ref = catData.flight_iata || catData.reference_number;
  if (!ref || typeof ref !== 'string') return null;
  return isValidFlightNumber(ref) ? ref.toUpperCase().replace(/\s/g, '') : null;
}

/**
 * Check if an activity is a verified flight (for UI display purposes)
 */
export function isVerifiedFlight(activity: Activity): boolean {
  return activity.category === 'transport' &&
    activity.category_data?.transport_type === 'Flug' &&
    !!activity.category_data?.flight_verified;
}

/**
 * Hook to track live flight status for all flight activities in a trip.
 * Only fetches when trip is trackable (active or within 1 day).
 */
export function useFlightStatus(
  activities: Activity[],
  tripStartDate: string,
  tripEndDate: string,
): Map<string, FlightInfo> {
  const [statuses, setStatuses] = useState<Map<string, FlightInfo>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatuses = useCallback(async () => {
    if (!isTripTrackable(tripStartDate, tripEndDate)) return;

    // Find all flight activities with valid flight numbers
    const flightActivities: Array<{ activityId: string; flightIata: string; flightDate?: string }> = [];
    for (const act of activities) {
      const fn = getFlightNumber(act);
      if (fn) flightActivities.push({
        activityId: act.id,
        flightIata: fn,
        flightDate: act.category_data?.departure_date || undefined,
      });
    }

    if (flightActivities.length === 0) return;

    const newStatuses = new Map<string, FlightInfo>();
    const now = Date.now();

    // Fetch in parallel (max 5 concurrent to respect free tier)
    const results = await Promise.allSettled(
      flightActivities.map(async ({ activityId, flightIata, flightDate }) => {
        // Check cache first (include date in cache key)
        const cacheKey = `${flightIata}_${flightDate || ''}`;
        const cached = flightCache.get(cacheKey);
        if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
          return { activityId, data: cached.data };
        }

        const data = await lookupFlight(flightIata, flightDate);
        if (data?.found) {
          flightCache.set(cacheKey, { data, fetchedAt: now });
          return { activityId, data };
        }
        return null;
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        newStatuses.set(result.value.activityId, result.value.data);
      }
    }

    if (newStatuses.size > 0) {
      setStatuses(newStatuses);
    }
  }, [activities, tripStartDate, tripEndDate]);

  useEffect(() => {
    fetchStatuses();

    // Set up periodic refresh
    if (isTripTrackable(tripStartDate, tripEndDate)) {
      intervalRef.current = setInterval(fetchStatuses, REFRESH_INTERVAL_MS);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatuses, tripStartDate, tripEndDate]);

  return statuses;
}

/**
 * Human-readable flight status labels
 */
export function getFlightStatusLabel(status: string | null): { label: string; color: string } {
  if (!status) return { label: '', color: '' };

  switch (status.toLowerCase()) {
    case 'scheduled':
      return { label: 'Geplant', color: '#3498DB' };
    case 'active':
    case 'en-route':
    case 'started':
      return { label: 'In der Luft', color: '#27AE60' };
    case 'landed':
      return { label: 'Gelandet', color: '#27AE60' };
    case 'cancelled':
      return { label: 'Annulliert', color: '#E74C3C' };
    case 'incident':
      return { label: 'Vorfall', color: '#E74C3C' };
    case 'diverted':
      return { label: 'Umgeleitet', color: '#E67E22' };
    case 'delayed':
      return { label: 'Verspätet', color: '#E67E22' };
    default:
      return { label: status, color: '#636E72' };
  }
}
