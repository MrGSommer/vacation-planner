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

// Replace/set the date portion of a time value, preserving only the time.
// dayOffset handles overnight flights (e.g. arrival = departure + 1 day).
function replaceDate(targetDate: string, timeVal: string | null, dayOffset = 0): string | null {
  if (!timeVal) return null;

  // Extract just the time portion
  let timePart: string;
  if (/^\d{4}-\d{2}-\d{2}/.test(timeVal)) {
    // Full datetime (e.g. "2026-02-26 19:53") — strip the date, keep time
    timePart = timeVal.split(/[T ]/)[1] || timeVal;
  } else {
    // Already time-only (e.g. "19:53")
    timePart = timeVal;
  }

  if (dayOffset === 0) {
    return `${targetDate} ${timePart}`;
  }

  // Apply day offset for overnight arrivals
  const d = new Date(targetDate + 'T00:00:00');
  d.setDate(d.getDate() + dayOffset);
  const offsetDate = d.toISOString().split('T')[0];
  return `${offsetDate} ${timePart}`;
}

// Normalize AirLabs response to our format
// isLive=true means data came from /flight endpoint (real-time status)
// isLive=false means data came from /schedules (status is meaningless for future dates)
async function normalizeFlightData(flight: any, flightIata: string, flightDate?: string, isLive = false): Promise<FlightResponse> {
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

  // Replace API dates with user's requested date (API returns "today" dates)
  if (flightDate && /^\d{4}-\d{2}-\d{2}$/.test(flightDate)) {
    // Calculate day offset between dep→arr (for overnight flights, e.g. dep 23:30 → arr 01:15+1)
    const origDepDate = depTimeLocal?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    const origArrDate = arrTimeLocal?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    let arrDayOffset = 0;
    if (origDepDate && origArrDate && origDepDate !== origArrDate) {
      arrDayOffset = Math.round(
        (new Date(origArrDate + 'T00:00:00').getTime() - new Date(origDepDate + 'T00:00:00').getTime()) / (24 * 60 * 60_000)
      );
    }

    depTimeLocal = replaceDate(flightDate, depTimeLocal);
    arrTimeLocal = replaceDate(flightDate, arrTimeLocal, arrDayOffset);
    depTimeUtc = replaceDate(flightDate, depTimeUtc);
    arrTimeUtc = replaceDate(flightDate, arrTimeUtc, arrDayOffset);
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
    // Live data (/flight): real-time status (delayed, active, landed, etc.)
    // Schedule data (/schedules): always return "scheduled" for future flights
    status: isLive ? (flight.status || flight.flight_status || 'scheduled') : 'scheduled',
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

    // Smart endpoint selection based on date proximity
    // - Today ± 1 day: try /flight first (live data), fall back to /schedules
    // - Future (> 1 day): skip /flight, go straight to /schedules (saves 1 API call)
    // - Past (> 1 day): only /schedules for schedule info
    let flightData: any = null;
    let isLiveData = false; // Track if data came from /flight (live) or /schedules

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    let daysDiff = 0;
    if (dateParam) {
      const reqDate = new Date(dateParam + 'T00:00:00');
      daysDiff = Math.round((reqDate.getTime() - new Date(todayStr + 'T00:00:00').getTime()) / (24 * 60 * 60_000));
    }

    const tryFlightEndpoint = !dateParam || (daysDiff >= -1 && daysDiff <= 1);
    const trySchedulesEndpoint = true; // Always available as fallback

    // Step 1: /flight endpoint (only for today ± 1 day or no date specified)
    if (tryFlightEndpoint) {
      try {
        const flightRes = await fetch(
          `${AIRLABS_BASE}/flight?flight_iata=${normalized}&api_key=${AIRLABS_API_KEY}`,
          { signal: AbortSignal.timeout(8000) },
        );
        if (flightRes.ok) {
          const data = await flightRes.json();
          if (data?.response) {
            if (dateParam) {
              const depTime = data.response.dep_time || data.response.dep_time_utc || '';
              if (depTime.startsWith(dateParam)) {
                flightData = data.response;
                isLiveData = true;
              }
            } else {
              flightData = data.response;
              isLiveData = true;
            }
          }
        }
      } catch (e) {
        console.error('AirLabs /flight error:', e);
      }
    }

    // Step 2: /schedules endpoint (if /flight didn't return data)
    if (!flightData && trySchedulesEndpoint) {
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

    const result = await normalizeFlightData(flightData, normalized, dateParam, isLiveData);
    return json(result, origin);
  } catch (e) {
    console.error('flight-lookup error:', e);
    return json({ error: 'Ein unerwarteter Fehler ist aufgetreten.' }, origin, 500);
  }
});
