const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY') || '';

export interface PlaceResult {
  place_id: string;
  lat: number;
  lng: number;
  address: string;
  google_maps_url: string;
}

export async function lookupPlace(query: string): Promise<PlaceResult | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1, languageCode: 'de' }),
    });
    const data = await res.json();
    const place = data.places?.[0];
    if (!place) return null;
    return {
      place_id: place.id,
      lat: place.location.latitude,
      lng: place.location.longitude,
      address: place.formattedAddress,
      google_maps_url: place.googleMapsUri,
    };
  } catch (e) {
    console.error('Places API lookup failed:', e);
    return null;
  }
}

/**
 * Enrich a plan's activities and stops with Google Places API data.
 * Runs lookups in parallel (max `concurrency` at a time).
 */
export async function enrichPlanWithPlaces(
  plan: any,
  destination: string,
  concurrency = 5,
): Promise<void> {
  if (!GOOGLE_MAPS_API_KEY) return;

  const stops = plan.stops || [];

  // Find which stop/city a date belongs to (for multi-stop trips)
  function getStopForDate(date: string): string {
    for (const stop of stops) {
      const arr = stop.arrival_date;
      const dep = stop.departure_date;
      if (arr && dep && date >= arr && date <= dep) return stop.name;
      if (arr && !dep && date === arr) return stop.name;
    }
    return destination; // fallback to trip destination
  }

  // Collect unique location queries
  // Key = "name||context" to handle same name in different cities
  const locationMap = new Map<string, { query: string }>();

  // Stops: use trip destination as context
  for (const stop of stops) {
    if (stop.name) {
      const key = `stop::${stop.name}`;
      if (!locationMap.has(key)) {
        locationMap.set(key, { query: `${stop.name}, ${destination}` });
      }
    }
  }

  // Activities: use per-day stop/city as context (e.g. "Colosseum, Rome" not "Colosseum, Europe Tour")
  for (const day of plan.days || []) {
    const dayContext = getStopForDate(day.date);
    for (const act of day.activities || []) {
      if (act.location_name) {
        const key = `${act.location_name}||${dayContext}`;
        if (!locationMap.has(key)) {
          locationMap.set(key, { query: `${act.location_name}, ${dayContext}` });
        }
      }
    }
  }

  // Parallel lookups with concurrency limit
  const entries = Array.from(locationMap.entries());
  const results = new Map<string, PlaceResult>();

  for (let i = 0; i < entries.length; i += concurrency) {
    const batch = entries.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async ([key, { query }]) => {
        const result = await lookupPlace(query);
        return [key, result] as const;
      }),
    );
    for (const [key, result] of batchResults) {
      if (result) results.set(key, result);
    }
  }

  // Apply results to stops
  for (const stop of stops) {
    const result = results.get(`stop::${stop.name}`);
    if (result) {
      stop.lat = result.lat;
      stop.lng = result.lng;
      stop.address = result.address;
      stop.place_id = result.place_id;
    }
  }

  // Apply results to activities
  for (const day of plan.days || []) {
    const dayContext = getStopForDate(day.date);
    for (const act of day.activities || []) {
      const key = act.location_name ? `${act.location_name}||${dayContext}` : null;
      const result = key ? results.get(key) : null;
      if (result) {
        act.location_lat = result.lat;
        act.location_lng = result.lng;
        act.location_address = result.address;
        if (!act.category_data) act.category_data = {};
        act.category_data.google_maps_url = result.google_maps_url;
      } else if (act.location_name && act.location_lat && act.location_lng) {
        // Fallback: name search centered at coordinates (opens real Places entry in correct area)
        if (!act.category_data) act.category_data = {};
        if (!act.category_data.google_maps_url) {
          act.category_data.google_maps_url =
            `https://www.google.com/maps/search/${encodeURIComponent(act.location_name)}/@${act.location_lat},${act.location_lng},17z`;
        }
      }
    }
  }
}
