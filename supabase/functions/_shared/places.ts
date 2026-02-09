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

  // Collect unique location queries
  const locationMap = new Map<string, { query: string }>();

  // Stops
  for (const stop of plan.stops || []) {
    if (stop.name && !locationMap.has(stop.name)) {
      locationMap.set(stop.name, { query: `${stop.name}, ${destination}` });
    }
  }

  // Activities
  for (const day of plan.days || []) {
    for (const act of day.activities || []) {
      if (act.location_name && !locationMap.has(act.location_name)) {
        locationMap.set(act.location_name, { query: `${act.location_name}, ${destination}` });
      }
    }
  }

  // Parallel lookups with concurrency limit
  const entries = Array.from(locationMap.entries());
  const results = new Map<string, PlaceResult>();

  for (let i = 0; i < entries.length; i += concurrency) {
    const batch = entries.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async ([name, { query }]) => {
        const result = await lookupPlace(query);
        return [name, result] as const;
      }),
    );
    for (const [name, result] of batchResults) {
      if (result) results.set(name, result);
    }
  }

  // Apply results to stops
  for (const stop of plan.stops || []) {
    const result = results.get(stop.name);
    if (result) {
      stop.lat = result.lat;
      stop.lng = result.lng;
      stop.address = result.address;
      stop.place_id = result.place_id;
    }
  }

  // Apply results to activities
  for (const day of plan.days || []) {
    for (const act of day.activities || []) {
      const result = act.location_name ? results.get(act.location_name) : null;
      if (result) {
        act.location_lat = result.lat;
        act.location_lng = result.lng;
        act.location_address = result.address;
        if (!act.category_data) act.category_data = {};
        act.category_data.google_maps_url = result.google_maps_url;
      } else if (act.location_name && act.location_lat && act.location_lng) {
        // Fallback: name-based Google Maps URL
        if (!act.category_data) act.category_data = {};
        if (!act.category_data.google_maps_url) {
          act.category_data.google_maps_url =
            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(act.location_name)}`;
        }
      }
    }
  }
}
