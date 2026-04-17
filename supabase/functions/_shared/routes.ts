/**
 * Travel time computation via Google Routes API.
 * Fail-open: returns null on any error so verification never blocks plan generation.
 */

export function haversineDistance(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);

  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;

  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function computeTravelTime(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  travelMode: 'DRIVE' | 'TRANSIT' | 'WALK' | 'BICYCLE',
): Promise<{ duration_minutes: number; distance_meters: number } | null> {
  try {
    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      console.warn('[routes] GOOGLE_MAPS_API_KEY not set');
      return null;
    }

    const body = {
      origin: {
        location: {
          latLng: { latitude: origin.lat, longitude: origin.lng },
        },
      },
      destination: {
        location: {
          latLng: { latitude: destination.lat, longitude: destination.lng },
        },
      },
      travelMode,
    };

    const res = await fetch(
      `https://routes.googleapis.com/directions/v2:computeRoutes`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      console.warn(`[routes] API returned ${res.status}: ${await res.text()}`);
      return null;
    }

    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) {
      console.warn('[routes] No route found');
      return null;
    }

    // duration comes as "123s" string
    const durationSec = parseInt(route.duration?.replace('s', '') ?? '0', 10);
    const distanceMeters = route.distanceMeters ?? 0;

    return {
      duration_minutes: Math.ceil(durationSec / 60),
      distance_meters: distanceMeters,
    };
  } catch (err) {
    console.warn('[routes] Error computing travel time:', err);
    return null;
  }
}
