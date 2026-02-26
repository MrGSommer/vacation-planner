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

export async function lookupFlight(flightIata: string): Promise<FlightInfo | null> {
  const normalized = flightIata.toUpperCase().replace(/\s/g, '');
  if (!isValidFlightNumber(normalized)) return null;

  try {
    const { data, error } = await supabase.functions.invoke('flight-lookup', {
      body: { flight_iata: normalized },
    });

    if (error) {
      console.error('Flight lookup error:', error);
      return null;
    }

    if (data?.error && !data?.found) return null;

    return data as FlightInfo;
  } catch (e) {
    console.error('Flight lookup failed:', e);
    return null;
  }
}
