// Flight Lookup Edge Function — AirLabs API integration
// Accepts a flight IATA code (e.g. "LX1234") and returns normalized flight data

import { corsHeaders, json } from '../_shared/cors.ts';
import { getUser } from '../_shared/claude.ts';

const AIRLABS_API_KEY = Deno.env.get('AIRLABS_API_KEY') || '';
const AIRLABS_BASE = 'https://airlabs.co/api/v9';

// In-memory airport city name cache (persists across warm invocations)
const airportCache = new Map<string, { city: string; name: string }>();

// Rate limiting: 20 lookups per minute per user
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// Fetch airport city name from AirLabs
async function getAirportInfo(iata: string): Promise<{ city: string; name: string }> {
  if (airportCache.has(iata)) return airportCache.get(iata)!;

  try {
    const res = await fetch(
      `${AIRLABS_BASE}/airports?iata_code=${iata}&api_key=${AIRLABS_API_KEY}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (res.ok) {
      const data = await res.json();
      const airport = data?.response?.[0];
      if (airport) {
        const info = { city: airport.city || iata, name: airport.name || iata };
        airportCache.set(iata, info);
        return info;
      }
    }
  } catch {
    // Fallback to IATA code
  }
  return { city: iata, name: iata };
}

interface FlightResponse {
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
  arr_time_utc: string | null;
  dep_time_local: string | null;
  arr_time_local: string | null;
  duration_min: number | null;
  status: string | null;
  aircraft: string | null;
}

// Combine a flight_date (YYYY-MM-DD) with a time-only or datetime string
function applyDate(flightDate: string, timeVal: string | null): string | null {
  if (!timeVal) return null;
  // Already has a date portion (e.g. "2026-03-15 10:30" or "2026-03-15T10:30:00")
  if (/^\d{4}-\d{2}-\d{2}/.test(timeVal)) return timeVal;
  // Time-only (e.g. "10:30") — prepend the flight_date
  return `${flightDate} ${timeVal}`;
}

// Normalize AirLabs response to our format
async function normalizeFlightData(flight: any, flightIata: string, flightDate?: string): Promise<FlightResponse> {
  // Enrich airport info in parallel
  const depIata = flight.dep_iata || null;
  const arrIata = flight.arr_iata || null;

  const [depInfo, arrInfo] = await Promise.all([
    depIata ? getAirportInfo(depIata) : Promise.resolve({ city: null, name: null }),
    arrIata ? getAirportInfo(arrIata) : Promise.resolve({ city: null, name: null }),
  ]);

  let depTimeLocal = flight.dep_time || null;
  let arrTimeLocal = flight.arr_time || null;
  let depTimeUtc = flight.dep_time_utc || flight.dep_time || null;
  let arrTimeUtc = flight.arr_time_utc || flight.arr_time || null;

  // If flight_date provided and times are time-only (from /schedules), attach the date
  if (flightDate && /^\d{4}-\d{2}-\d{2}$/.test(flightDate)) {
    depTimeLocal = applyDate(flightDate, depTimeLocal);
    arrTimeLocal = applyDate(flightDate, arrTimeLocal);
    depTimeUtc = applyDate(flightDate, depTimeUtc);
    arrTimeUtc = applyDate(flightDate, arrTimeUtc);
  }

  return {
    found: true,
    flight_iata: flight.flight_iata || flightIata,
    airline_name: flight.airline_name || null,
    airline_iata: flight.airline_iata || flightIata.replace(/\d+/g, ''),
    dep_airport: depIata,
    dep_city: depInfo.city,
    dep_terminal: flight.dep_terminal || null,
    dep_gate: flight.dep_gate || null,
    arr_airport: arrIata,
    arr_city: arrInfo.city,
    arr_terminal: flight.arr_terminal || null,
    arr_gate: flight.arr_gate || null,
    dep_time_utc: depTimeUtc,
    arr_time_utc: arrTimeUtc,
    dep_time_local: depTimeLocal,
    arr_time_local: arrTimeLocal,
    duration_min: flight.duration || null,
    status: flight.status || flight.flight_status || null,
    aircraft: flight.aircraft_icao || null,
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Nicht authentifiziert' }, origin, 401);

    const token = authHeader.replace('Bearer ', '');
    const user = await getUser(token);
    if (!user?.id) return json({ error: 'Auth fehlgeschlagen' }, origin, 401);

    // Rate limit
    if (!checkRateLimit(user.id)) {
      return json({ error: 'Zu viele Anfragen. Bitte warte kurz.' }, origin, 429);
    }

    if (!AIRLABS_API_KEY) {
      return json({ error: 'Flight-Service nicht konfiguriert' }, origin, 500);
    }

    const body = await req.json().catch(() => ({}));
    const { flight_iata, flight_date } = body;

    if (!flight_iata || typeof flight_iata !== 'string') {
      return json({ error: 'flight_iata erforderlich' }, origin, 400);
    }

    // Validate IATA format: 2 letters + 1-5 digits
    const normalized = flight_iata.toUpperCase().replace(/\s/g, '');
    if (!/^[A-Z0-9]{2}\d{1,5}$/.test(normalized)) {
      return json({ error: 'Ungültiges Flugnummern-Format (z.B. LX1234)' }, origin, 400);
    }

    // Validate flight_date if provided (YYYY-MM-DD)
    const dateParam = (typeof flight_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(flight_date))
      ? flight_date : undefined;

    console.log(`flight-lookup: ${normalized}, date: ${dateParam || 'none'}`);

    // Try /flight endpoint first (live/recent flights)
    let flightData: any = null;

    try {
      const flightRes = await fetch(
        `${AIRLABS_BASE}/flight?flight_iata=${normalized}&api_key=${AIRLABS_API_KEY}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (flightRes.ok) {
        const data = await flightRes.json();
        if (data?.response) {
          // If date given, only use live data if it matches the requested date
          if (dateParam) {
            const depTime = data.response.dep_time || data.response.dep_time_utc || '';
            if (depTime.startsWith(dateParam)) {
              flightData = data.response;
            }
            // else: live flight is for a different date, skip to schedules
          } else {
            flightData = data.response;
          }
        }
      }
    } catch (e) {
      console.error('AirLabs /flight error:', e);
    }

    // Fallback: /schedules endpoint (future scheduled flights)
    if (!flightData) {
      try {
        const schedRes = await fetch(
          `${AIRLABS_BASE}/schedules?flight_iata=${normalized}&api_key=${AIRLABS_API_KEY}`,
          { signal: AbortSignal.timeout(8000) },
        );
        if (schedRes.ok) {
          const data = await schedRes.json();
          if (data?.response?.length > 0) {
            if (dateParam) {
              // Filter by day of week: schedules have 'days' array (1=Mon ... 7=Sun)
              const requestedDate = new Date(dateParam + 'T00:00:00');
              const jsDay = requestedDate.getDay(); // 0=Sun, 1=Mon ... 6=Sat
              const airlabsDay = jsDay === 0 ? 7 : jsDay; // Convert to 1=Mon ... 7=Sun
              const matching = data.response.find((s: any) =>
                !s.days || s.days.length === 0 || s.days.includes(String(airlabsDay))
              );
              flightData = matching || data.response[0];
            } else {
              flightData = data.response[0];
            }
          }
        }
      } catch (e) {
        console.error('AirLabs /schedules error:', e);
      }
    }

    if (!flightData) {
      return json({
        found: false,
        flight_iata: normalized,
        error: 'Flug nicht gefunden. Prüfe die Flugnummer oder versuche es später erneut.',
      }, origin);
    }

    const result = await normalizeFlightData(flightData, normalized, dateParam);
    return json(result, origin);
  } catch (e) {
    console.error('flight-lookup error:', e);
    return json({ error: 'Ein unerwarteter Fehler ist aufgetreten.' }, origin, 500);
  }
});
