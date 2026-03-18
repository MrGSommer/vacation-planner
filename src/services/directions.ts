import { Platform } from 'react-native';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

let mapsLoading: Promise<void> | null = null;

const ensureGoogleMaps = (): Promise<void> => {
  if (Platform.OS !== 'web') return Promise.resolve();
  if (mapsLoading) return mapsLoading;
  mapsLoading = new Promise<void>((resolve, reject) => {
    let attempts = 0;
    const MAX_ATTEMPTS = 200; // 10s max (200 * 50ms)
    const waitForApi = () => {
      if ((window as any).google?.maps?.importLibrary) { resolve(); return; }
      attempts++;
      if (attempts >= MAX_ATTEMPTS) {
        mapsLoading = null; // Reset so retry is possible
        reject(new Error('Google Maps API timed out'));
        return;
      }
      setTimeout(waitForApi, 50);
    };
    if ((window as any).google?.maps?.importLibrary) { resolve(); return; }
    const existing = document.getElementById('google-maps-script');
    if (existing) { waitForApi(); return; }
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places,marker&loading=async`;
    script.async = true;
    script.onload = () => waitForApi();
    script.onerror = () => {
      mapsLoading = null; // Reset so retry is possible on next call
      reject(new Error('Failed to load Google Maps'));
    };
    document.head.appendChild(script);
  });
  return mapsLoading;
};

export type TravelMode = 'driving' | 'walking' | 'bicycling' | 'transit';

export const TRAVEL_MODES: { id: TravelMode; label: string; icon: string }[] = [
  { id: 'driving', label: 'Auto', icon: 'car-outline' },
  { id: 'transit', label: 'ÖV', icon: 'train-outline' },
  { id: 'walking', label: 'Zu Fuss', icon: 'walk-outline' },
  { id: 'bicycling', label: 'Velo', icon: 'bicycle-outline' },
];

export interface DirectionsResult {
  duration: number; // minutes
  distance: number; // meters
  mode: TravelMode;
}

/** Map internal travel mode to Google Routes API travel mode */
const toGoogleTravelMode = (mode: TravelMode): string => {
  switch (mode) {
    case 'driving': return 'DRIVING';
    case 'walking': return 'WALKING';
    case 'bicycling': return 'BICYCLING';
    case 'transit': return 'TRANSIT';
    default: return 'DRIVING';
  }
};

/** REST API fallback for native (Routes API v2) */
const getDirectionsRest = async (
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: TravelMode = 'driving'
): Promise<DirectionsResult | null> => {
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        travelMode: toGoogleTravelMode(mode),
      }),
    });
    const data = await res.json();
    if (!data.routes?.length) return null;
    const route = data.routes[0];
    // duration is a string like "1234s"
    const durationSec = parseInt(route.duration?.replace('s', '') || '0', 10);
    return {
      duration: Math.round(durationSec / 60),
      distance: route.distanceMeters || 0,
      mode,
    };
  } catch {
    return null;
  }
};

/** Web implementation using Maps JavaScript API Route class (computeRoutes) */
const getDirectionsWeb = async (
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: TravelMode = 'driving'
): Promise<DirectionsResult | null> => {
  try {
    await ensureGoogleMaps();
    const google = (window as any).google;
    if (!google?.maps?.importLibrary) return getDirectionsRest(origin, destination, mode);

    const { Route } = await google.maps.importLibrary('routes');
    if (!Route?.computeRoutes) {
      // Fallback to REST if Route class not available
      return getDirectionsRest(origin, destination, mode);
    }

    const request = {
      origin: new google.maps.LatLng(origin.lat, origin.lng),
      destination: new google.maps.LatLng(destination.lat, destination.lng),
      travelMode: toGoogleTravelMode(mode),
      fields: ['durationMillis', 'distanceMeters'],
    };

    const { routes } = await Route.computeRoutes(request);
    if (routes?.length) {
      const route = routes[0];
      const durationMs = route.durationMillis || 0;
      return {
        duration: Math.round(durationMs / 60000),
        distance: route.distanceMeters || 0,
        mode,
      };
    }
    return null;
  } catch {
    // Fallback to REST on any error
    return getDirectionsRest(origin, destination, mode);
  }
};

export const getDirections = async (
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: TravelMode = 'driving'
): Promise<DirectionsResult | null> => {
  if (Platform.OS === 'web') {
    return getDirectionsWeb(origin, destination, mode);
  }
  return getDirectionsRest(origin, destination, mode);
};

export const formatDuration = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} Min.`;
  if (m === 0) return `${h} Std.`;
  return `${h} Std. ${m} Min.`;
};

export const formatDistance = (meters: number): string => {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
};

// --- Transit details (Google Routes API) ---

export interface TransitDetail {
  lineName: string;        // e.g. "ICE 374"
  carrier: string;         // e.g. "Deutsche Bahn"
  transitType: string;     // BUS, RAIL, FERRY, etc.
  depTime: string;         // HH:MM
  arrTime: string;         // HH:MM
  depStop: string;         // e.g. "Zürich HB"
  arrStop: string;         // e.g. "München Hf"
  durationMin: number;
}

export async function getTransitDetails(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<TransitDetail[]> {
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'routes.legs.steps.transitDetails,routes.legs.steps.travelMode,routes.duration,routes.legs.duration,routes.legs.steps.staticDuration',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        travelMode: 'TRANSIT',
        computeAlternativeRoutes: true,
      }),
    });
    const data = await res.json();
    if (!data.routes?.length) return [];

    const results: TransitDetail[] = [];

    for (const route of data.routes.slice(0, 5)) {
      const leg = route.legs?.[0];
      if (!leg?.steps) continue;

      // Find the primary transit step (longest duration)
      let primaryStep: any = null;
      let maxDuration = 0;

      for (const step of leg.steps) {
        if (step.travelMode !== 'TRANSIT' || !step.transitDetails) continue;
        const durSec = parseInt(step.staticDuration?.replace('s', '') || '0', 10);
        if (durSec > maxDuration) {
          maxDuration = durSec;
          primaryStep = step;
        }
      }

      if (!primaryStep) continue;

      const td = primaryStep.transitDetails;
      const depTimeRaw = td.stopDetails?.departureTime;
      const arrTimeRaw = td.stopDetails?.arrivalTime;

      const depTime = depTimeRaw ? new Date(depTimeRaw).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', hour12: false }) : '?';
      const arrTime = arrTimeRaw ? new Date(arrTimeRaw).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', hour12: false }) : '?';

      // Total route duration
      const totalDurSec = parseInt(route.duration?.replace('s', '') || '0', 10);

      results.push({
        lineName: td.transitLine?.name || '',
        carrier: td.transitLine?.agencies?.[0]?.name || '',
        transitType: td.transitLine?.vehicle?.type || 'RAIL',
        depTime,
        arrTime,
        depStop: td.stopDetails?.departureStop?.name || '',
        arrStop: td.stopDetails?.arrivalStop?.name || '',
        durationMin: Math.round(totalDurSec / 60),
      });
    }

    // Deduplicate by lineName+depTime
    const seen = new Set<string>();
    return results.filter(r => {
      const key = `${r.lineName}_${r.depTime}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return [];
  }
}

// --- Directions caching (7-day TTL) ---

const DIRECTIONS_CACHE_KEY = 'wf_directions_cache';
const DIRECTIONS_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedDirections {
  result: DirectionsResult;
  timestamp: number;
}

function directionsCacheKey(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
  mode: TravelMode,
): string {
  return `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}:${dest.lat.toFixed(5)},${dest.lng.toFixed(5)}:${mode}`;
}

function getDirectionsCache(): Record<string, CachedDirections> {
  if (Platform.OS !== 'web') return {};
  try {
    const raw = localStorage.getItem(DIRECTIONS_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setDirectionsCache(cache: Record<string, CachedDirections>): void {
  if (Platform.OS !== 'web') return;
  try {
    localStorage.setItem(DIRECTIONS_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

/** Cached directions — returns from cache if available and not expired, otherwise fetches fresh */
export const getCachedDirections = async (
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: TravelMode = 'driving',
): Promise<DirectionsResult | null> => {
  const key = directionsCacheKey(origin, destination, mode);
  const cache = getDirectionsCache();
  const entry = cache[key];

  // Return cached if still valid
  if (entry && Date.now() - entry.timestamp < DIRECTIONS_TTL) {
    return entry.result;
  }

  // Fetch fresh
  const result = await getDirections(origin, destination, mode);
  if (result) {
    cache[key] = { result, timestamp: Date.now() };
    // Prune old entries (keep max 100)
    const entries = Object.entries(cache);
    if (entries.length > 100) {
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const pruned = Object.fromEntries(entries.slice(-100));
      setDirectionsCache(pruned);
    } else {
      setDirectionsCache(cache);
    }
  }
  return result;
};
