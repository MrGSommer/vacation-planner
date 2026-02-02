import Constants from 'expo-constants';

const API_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  || '';

interface DirectionsResult {
  duration: number; // minutes
  distance: number; // meters
}

export const getDirections = async (
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<DirectionsResult | null> => {
  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&mode=driving&key=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'OK' || !data.routes?.length) return null;
    const leg = data.routes[0].legs[0];
    return {
      duration: Math.round(leg.duration.value / 60),
      distance: leg.distance.value,
    };
  } catch {
    return null;
  }
};

export const calculateRouteForStops = async (
  stops: Array<{ id: string; lat: number; lng: number }>
): Promise<Map<string, DirectionsResult>> => {
  const results = new Map<string, DirectionsResult>();
  for (let i = 1; i < stops.length; i++) {
    const result = await getDirections(stops[i - 1], stops[i]);
    if (result) results.set(stops[i].id, result);
  }
  return results;
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
