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

const FLIGHT_IATA_REGEX = /^[A-Z0-9]{2}\d{1,5}$/;

export function isValidFlightNumber(value: string): boolean {
  return FLIGHT_IATA_REGEX.test(value.toUpperCase().replace(/\s/g, ''));
}

// Client-side cache: deduplicates calls from useFlightStatus + FlightLookupWidget
const flightCache = new Map<string, { data: FlightInfo; fetchedAt: number }>();
const CACHE_TTL_MS = 15 * 60_000; // 15 minutes

function getCacheKey(flightIata: string, flightDate?: string): string {
  return `${flightIata}_${flightDate || ''}`;
}

export async function lookupFlight(flightIata: string, flightDate?: string): Promise<FlightInfo | null> {
  const normalized = flightIata.toUpperCase().replace(/\s/g, '');
  if (!isValidFlightNumber(normalized)) return null;

  // Check client cache first
  const cacheKey = getCacheKey(normalized, flightDate);
  const cached = flightCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const body: Record<string, string> = { flight_iata: normalized };
    if (flightDate && /^\d{4}-\d{2}-\d{2}$/.test(flightDate)) {
      body.flight_date = flightDate;
    }
    const { data, error } = await supabase.functions.invoke('flight-lookup', {
      body,
    });

    if (error) {
      console.error('Flight lookup error:', error);
      return null;
    }

    if (data?.error && !data?.found) return null;

    const result = data as FlightInfo;

    // Cache successful results
    if (result?.found) {
      flightCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
    }

    return result;
  } catch (e) {
    console.error('Flight lookup failed:', e);
    return null;
  }
}
