import { Platform } from 'react-native';
import Constants from 'expo-constants';

const API_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  || '';

let mapsLoading: Promise<void> | null = null;

const ensureGoogleMaps = (): Promise<void> => {
  if (Platform.OS !== 'web') return Promise.resolve();
  if (mapsLoading) return mapsLoading;
  mapsLoading = new Promise<void>((resolve, reject) => {
    const waitForApi = () => {
      if ((window as any).google?.maps?.importLibrary) { resolve(); return; }
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
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
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
