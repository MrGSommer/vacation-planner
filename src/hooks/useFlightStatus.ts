import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { lookupFlight, FlightInfo, isValidFlightNumber } from '../utils/flightLookup';
import { Activity } from '../types/database';

/**
 * Determines if a flight is in the "live window" where real-time status
 * is available from the AirLabs /flight endpoint (~24h before departure
 * until landing). Outside this window only schedule data is available.
 */
function isInLiveWindow(flightDate?: string, depTime?: string, arrTime?: string): boolean {
  if (!flightDate) return false;

  const now = new Date();

  // After arrival → no more live updates needed
  if (arrTime) {
    const arrDateTime = new Date(`${flightDate}T${arrTime}`);
    if (now > arrDateTime) return false;
  }

  // Check if within ~24h before departure
  const depDateTime = depTime
    ? new Date(`${flightDate}T${depTime}`)
    : new Date(flightDate + 'T00:00:00');

  const msUntilDep = depDateTime.getTime() - now.getTime();
  const hoursUntilDep = msUntilDep / (60 * 60_000);

  // Live window: from 24h before departure until arrival
  return hoursUntilDep <= 24;
}

/**
 * Returns the refresh interval for a flight in the live window.
 * Closer to departure/in flight = more frequent refreshes.
 */
function getLiveRefreshMs(flightDate?: string, depTime?: string, arrTime?: string): number {
  if (!flightDate || !depTime) return 15 * 60_000; // 15min default

  const now = new Date();
  const depDateTime = new Date(`${flightDate}T${depTime}`);

  // In the air (after departure, before arrival)
  if (now >= depDateTime) {
    return 3 * 60_000; // 3min
  }

  const msUntilDep = depDateTime.getTime() - now.getTime();
  const hoursUntilDep = msUntilDep / (60 * 60_000);

  if (hoursUntilDep <= 2) return 5 * 60_000;   // 5min - imminent
  if (hoursUntilDep <= 6) return 10 * 60_000;  // 10min
  return 15 * 60_000;                           // 15min - still within 24h
}

/**
 * Determines if a trip has any flights worth fetching data for.
 * Expanded to include any trip that hasn't ended yet (flight data like
 * route/times is useful even weeks before departure).
 */
export function isTripTrackable(startDate: string, endDate: string): boolean {
  const now = new Date();
  const end = new Date(endDate + 'T23:59:59');
  // Trip hasn't ended yet, or ended within 1 day (for final status)
  const oneDayAfterEnd = new Date(end.getTime() + 24 * 60 * 60_000);
  return now <= oneDayAfterEnd;
}

/**
 * Extract flight number from a verified transport activity's category_data.
 */
export function getFlightNumber(activity: Activity): string | null {
  if (activity.category !== 'transport') return null;
  const catData = activity.category_data || {};
  if (catData.transport_type !== 'Flug') return null;
  if (!catData.flight_verified) return null;
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

interface FlightEntry {
  activityId: string;
  flightIata: string;
  flightDate?: string;
  depTime?: string;
  arrTime?: string;
}

/**
 * Hook to track flight status for visible flight activities.
 *
 * Fetch strategy:
 * - Initial fetch: always (to get route, times, airline — even for future flights)
 * - Live refresh: ONLY when flight is within ~24h of departure (AirLabs /flight
 *   endpoint only returns live data for current/imminent flights)
 * - After landing: no more refreshes
 *
 * The Edge Function returns status="scheduled" for schedule-only data,
 * and real-time status (delayed/active/landed/etc.) for live data.
 */
export function useFlightStatus(
  activities: Activity[],
  tripStartDate: string,
  tripEndDate: string,
): Map<string, FlightInfo> {
  const [statuses, setStatuses] = useState<Map<string, FlightInfo>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialFetchDone = useRef(false);

  // Extract flight entries with stable key
  const flightEntries: FlightEntry[] = useMemo(() => {
    const entries: FlightEntry[] = [];
    for (const act of activities) {
      const fn = getFlightNumber(act);
      if (fn) {
        const catData = act.category_data || {};
        entries.push({
          activityId: act.id,
          flightIata: fn,
          flightDate: catData.departure_date || undefined,
          depTime: catData.departure_time || undefined,
          arrTime: catData.arrival_time || undefined,
        });
      }
    }
    return entries;
  }, [activities]);

  // Stable string key
  const flightKey = useMemo(
    () => flightEntries.map(e => `${e.activityId}:${e.flightIata}:${e.flightDate || ''}`).join('|'),
    [flightEntries],
  );

  // Check if ANY flight is in the live window (needs refresh)
  const hasLiveFlights = useMemo(
    () => flightEntries.some(e => isInLiveWindow(e.flightDate, e.depTime, e.arrTime)),
    [flightEntries],
  );

  // Shortest refresh interval among live flights only
  const liveRefreshMs = useMemo(() => {
    if (!hasLiveFlights) return null;
    let shortest = Infinity;
    for (const entry of flightEntries) {
      if (isInLiveWindow(entry.flightDate, entry.depTime, entry.arrTime)) {
        const ms = getLiveRefreshMs(entry.flightDate, entry.depTime, entry.arrTime);
        if (ms < shortest) shortest = ms;
      }
    }
    return shortest === Infinity ? null : shortest;
  }, [flightEntries, hasLiveFlights]);

  const fetchStatuses = useCallback(async () => {
    if (!isTripTrackable(tripStartDate, tripEndDate)) return;
    if (flightEntries.length === 0) return;

    const results = await Promise.allSettled(
      flightEntries.map(async ({ activityId, flightIata, flightDate }) => {
        const data = await lookupFlight(flightIata, flightDate);
        if (data?.found) {
          return { activityId, data };
        }
        return null;
      }),
    );

    setStatuses(prev => {
      const merged = new Map(prev);
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          merged.set(result.value.activityId, result.value.data);
        }
      }
      return merged;
    });
  }, [flightKey, tripStartDate, tripEndDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial fetch (once per flight set change)
  useEffect(() => {
    initialFetchDone.current = false;
    fetchStatuses().then(() => { initialFetchDone.current = true; });
  }, [fetchStatuses]);

  // Live refresh interval — only active when flights are in the live window
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (liveRefreshMs !== null && isTripTrackable(tripStartDate, tripEndDate)) {
      intervalRef.current = setInterval(fetchStatuses, liveRefreshMs);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchStatuses, liveRefreshMs, tripStartDate, tripEndDate]);

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
