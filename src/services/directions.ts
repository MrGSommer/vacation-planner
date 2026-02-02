import { Platform } from 'react-native';
import Constants from 'expo-constants';

const API_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  || '';

const ensureGoogleMaps = (): Promise<void> => {
  if (Platform.OS !== 'web') return Promise.resolve();
  return new Promise((resolve, reject) => {
    if ((window as any).google?.maps) { resolve(); return; }
    const existing = document.getElementById('google-maps-script');
    if (existing) { existing.addEventListener('load', () => resolve()); return; }
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places&loading=async`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });
};

export type TravelMode = 'driving' | 'walking' | 'bicycling' | 'transit';

export const TRAVEL_MODES: { id: TravelMode; label: string; icon: string }[] = [
  { id: 'driving', label: 'Auto', icon: '🚗' },
  { id: 'transit', label: 'ÖV', icon: '🚆' },
  { id: 'walking', label: 'Zu Fuss', icon: '🚶' },
  { id: 'bicycling', label: 'Velo', icon: '🚲' },
];

export interface DirectionsResult {
  duration: number; // minutes
  distance: number; // meters
  mode: TravelMode;
}

const modeToGoogleMode = (mode: TravelMode): string => {
  switch (mode) {
    case 'driving': return 'driving';
    case 'walking': return 'walking';
    case 'bicycling': return 'bicycling';
    case 'transit': return 'transit';
    default: return 'driving';
  }
};

const getDirectionsRest = async (
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: TravelMode = 'driving'
): Promise<DirectionsResult | null> => {
  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&mode=${modeToGoogleMode(mode)}&key=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'OK' || !data.routes?.length) return null;
    const leg = data.routes[0].legs[0];
    return {
      duration: Math.round(leg.duration.value / 60),
      distance: leg.distance.value,
      mode,
    };
  } catch {
    return null;
  }
};

const getDirectionsWeb = async (
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: TravelMode = 'driving'
): Promise<DirectionsResult | null> => {
  try {
    await ensureGoogleMaps();
    const google = (window as any).google;
    if (!google?.maps) return null;
    const modeMap: Record<string, any> = {
      driving: google.maps.TravelMode.DRIVING,
      walking: google.maps.TravelMode.WALKING,
      bicycling: google.maps.TravelMode.BICYCLING,
      transit: google.maps.TravelMode.TRANSIT,
    };
    const service = new google.maps.DirectionsService();
    const result = await service.route({
      origin: new google.maps.LatLng(origin.lat, origin.lng),
      destination: new google.maps.LatLng(destination.lat, destination.lng),
      travelMode: modeMap[mode] || modeMap.driving,
    });
    if (result.routes?.length) {
      const leg = result.routes[0].legs[0];
      return {
        duration: Math.round(leg.duration.value / 60),
        distance: leg.distance.value,
        mode,
      };
    }
    return null;
  } catch {
    return null;
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
