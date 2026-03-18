import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { lookupFlight, FlightInfo, isValidFlightNumber } from '../utils/flightLookup';
import { getFlightLegs } from '../utils/categoryFields';
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
    // Handle arrival on next day (overnight flights): if arrTime < depTime, arrival is +1 day
    let arrDateStr = flightDate;
    if (depTime && arrTime < depTime) {
      const d = new Date(flightDate + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      arrDateStr = d.toISOString().split('T')[0];
    }
    const arrDateTime = new Date(`${arrDateStr}T${arrTime}`);
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
 * Checks if a flight is frozen (past arrival date, no more API calls needed).
 * Returns true if the flight's arrival date+time is in the past.
 */
function isFlightFrozen(flightDate?: string, arrTime?: string, depTime?: string, status?: string | null): boolean {
  // Already marked as frozen by API (landed/cancelled)
  if (status === 'landed' || status === 'cancelled') return true;

  if (!flightDate) return false;

  const now = new Date();

  // Calculate arrival datetime
  let arrDateStr = flightDate;
  if (arrTime) {
    // Handle overnight flights
    if (depTime && arrTime < depTime) {
      const d = new Date(flightDate + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      arrDateStr = d.toISOString().split('T')[0];
    }
    const arrDateTime = new Date(`${arrDateStr}T${arrTime}`);
    // Add 2h buffer after arrival for final status
    return now.getTime() > arrDateTime.getTime() + 2 * 60 * 60_000;
  }

  // No arrival time: freeze if flight date is > 1 day in the past
  const flightEnd = new Date(flightDate + 'T23:59:59');
  return now.getTime() > flightEnd.getTime() + 24 * 60 * 60_000;
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
 * Extract ALL flight numbers from a multi-leg flight activity.
 * Returns an array of valid, normalized flight numbers (one per leg).
 * Falls back to reference_number / via_flight_number for old data without flight_legs.
 */
export function getFlightNumbers(activity: Activity): string[] {
  if (activity.category !== 'transport') return [];
  const catData = activity.category_data || {};
  if (catData.transport_type !== 'Flug') return [];

  const legs = getFlightLegs(catData);
  if (legs.length > 0) {
    return legs
      .map(leg => leg.flight_number)
      .filter((fn): fn is string => typeof fn === 'string' && isValidFlightNumber(fn))
      .map(fn => fn.toUpperCase().replace(/\s/g, ''));
  }

  // Backward compat: no flight_legs, check flat fields
  const numbers: string[] = [];
  const ref = catData.flight_iata || catData.reference_number;
  if (ref && typeof ref === 'string' && isValidFlightNumber(ref)) {
    numbers.push(ref.toUpperCase().replace(/\s/g, ''));
  }
  const via = catData.via_flight_number;
  if (via && typeof via === 'string' && isValidFlightNumber(via)) {
    numbers.push(via.toUpperCase().replace(/\s/g, ''));
  }
  return numbers;
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
  const statusesRef = useRef(statuses);
  useEffect(() => { statusesRef.current = statuses; }, [statuses]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialFetchDone = useRef(false);

  // Extract flight entries with stable key — one entry per leg
  const flightEntries: FlightEntry[] = useMemo(() => {
    const entries: FlightEntry[] = [];
    for (const act of activities) {
      const flightNums = getFlightNumbers(act);
      if (flightNums.length === 0) continue;

      const catData = act.category_data || {};
      const legs = getFlightLegs(catData);

      if (legs.length > 0) {
        // Multi-leg: each leg gets its own entry with leg-specific dates/times
        legs.forEach((leg, i) => {
          const fn = leg.flight_number;
          if (!fn || !isValidFlightNumber(fn)) return;
          entries.push({
            activityId: `${act.id}_leg${i}`,
            flightIata: fn.toUpperCase().replace(/\s/g, ''),
            flightDate: leg.dep_date || catData.departure_date || undefined,
            depTime: leg.dep_time || undefined,
            arrTime: leg.arr_time || undefined,
          });
        });
      } else {
        // Backward compat: flat fields, one entry per flight number
        flightNums.forEach((fn, i) => {
          entries.push({
            activityId: i === 0 ? act.id : `${act.id}_leg${i}`,
            flightIata: fn,
            flightDate: catData.departure_date || undefined,
            depTime: i === 0 ? (catData.departure_time || undefined) : undefined,
            arrTime: i === 0 ? (catData.arrival_time || undefined) : undefined,
          });
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
      flightEntries.map(async ({ activityId, flightIata, flightDate, depTime, arrTime }) => {
        // Skip frozen flights — use ref for current value (avoids stale closure)
        const existing = statusesRef.current.get(activityId);
        if (existing?.frozen) return null;
        if (isFlightFrozen(flightDate, arrTime, depTime, existing?.status)) {
          // Mark as frozen in cache so we never fetch again
          if (existing) {
            return { activityId, data: { ...existing, frozen: true } };
          }
          return null;
        }

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
