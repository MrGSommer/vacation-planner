import { supabase } from '../api/supabase';

export interface FlightInfo {
  found: boolean;
  flight_iata: string;
  airline_name: string | null;
  airline_iata: string | null;
  dep_airport: string | null;
  dep_city: string | null;
  dep_terminal: string | null;
  dep_gate: string | null;
  arr_airport: string | null;
  arr_city: string | null;
  arr_terminal: string | null;
  arr_gate: string | null;
  dep_time_utc: string | null;
  dep_time_local: string | null;
  arr_time_utc: string | null;
  arr_time_local: string | null;
  duration_min: number | null;
  status: string | null;
  aircraft: string | null;
}

export interface RouteFlightInfo {
  flight_iata: string;
  airline_iata: string | null;
  airline_name: string | null;
  dep_time: string | null;
  arr_time: string | null;
  duration: number | null;
  days: string[]; // Operating days: "1"=Mon ... "7"=Sun
}

const FLIGHT_IATA_REGEX = /^[A-Z0-9]{2}\d{1,5}$/;

export function isValidFlightNumber(value: string): boolean {
  return FLIGHT_IATA_REGEX.test(value.toUpperCase().replace(/\s/g, ''));
}

// Client-side cache + in-flight request deduplication
const flightCache = new Map<string, { data: FlightInfo; fetchedAt: number }>();
const CACHE_TTL_MS = 15 * 60_000; // 15 minutes
// Prevents duplicate concurrent API calls (e.g. useFlightStatus + FlightLookupWidget firing simultaneously)
const inflightRequests = new Map<string, Promise<FlightInfo | null>>();

function getCacheKey(flightIata: string, flightDate?: string): string {
  return `${flightIata}_${flightDate || ''}`;
}

// Route search cache
const routeCache = new Map<string, { data: RouteFlightInfo[]; fetchedAt: number }>();
const ROUTE_CACHE_TTL_MS = 30 * 60_000; // 30 minutes (routes change rarely)

export async function searchFlightsByRoute(depIata: string, arrIata: string): Promise<RouteFlightInfo[]> {
  const cacheKey = `${depIata}_${arrIata}`;
  const cached = routeCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < ROUTE_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const { data, error } = await supabase.functions.invoke('flight-lookup', {
      body: { mode: 'route_search', dep_iata: depIata, arr_iata: arrIata },
    });
    if (error) {
      console.error('Route search error:', error);
      return [];
    }
    const routes: RouteFlightInfo[] = data?.routes || [];
    if (routes.length > 0) {
      routeCache.set(cacheKey, { data: routes, fetchedAt: Date.now() });
    }
    return routes;
  } catch (e) {
    console.error('Route search failed:', e);
    return [];
  }
}

export async function lookupFlight(flightIata: string, flightDate?: string): Promise<FlightInfo | null> {
  const normalized = flightIata.toUpperCase().replace(/\s/g, '');
  if (!isValidFlightNumber(normalized)) return null;

  const cacheKey = getCacheKey(normalized, flightDate);

  // 1. Check client cache
  const cached = flightCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  // 2. Deduplicate: if same request is already in-flight, reuse its promise
  const inflight = inflightRequests.get(cacheKey);
  if (inflight) return inflight;

  // 3. Perform the actual API call
  const promise = performFlightLookup(normalized, flightDate, cacheKey);
  inflightRequests.set(cacheKey, promise);

  try {
    return await promise;
  } finally {
    inflightRequests.delete(cacheKey);
  }
}

async function performFlightLookup(normalized: string, flightDate: string | undefined, cacheKey: string): Promise<FlightInfo | null> {
  try {
    const body: Record<string, string> = { flight_iata: normalized };
    if (flightDate && /^\d{4}-\d{2}-\d{2}$/.test(flightDate)) {
      body.flight_date = flightDate;
    }
    const response = await supabase.functions.invoke('flight-lookup', { body });

    if (response.error) {
      console.error('Flight lookup error:', response.error);
      return null;
    }

    const data = response.data;
    if (!data || (data.error && !data.found)) return null;

    const result: FlightInfo = {
      found: !!data.found,
      flight_iata: data.flight_iata || normalized,
      airline_name: data.airline_name || null,
      airline_iata: data.airline_iata || null,
      dep_airport: data.dep_airport || null,
      dep_city: data.dep_city || null,
      dep_terminal: data.dep_terminal || null,
      dep_gate: data.dep_gate || null,
      arr_airport: data.arr_airport || null,
      arr_city: data.arr_city || null,
      arr_terminal: data.arr_terminal || null,
      arr_gate: data.arr_gate || null,
      dep_time_utc: data.dep_time_utc || null,
      dep_time_local: data.dep_time_local || null,
      arr_time_utc: data.arr_time_utc || null,
      arr_time_local: data.arr_time_local || null,
      duration_min: data.duration_min || null,
      status: data.status || null,
      aircraft: data.aircraft || null,
    };

    if (result.found) {
      flightCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
    }

    return result;
  } catch (e) {
    console.error('Flight lookup failed:', e);
    return null;
  }
}
