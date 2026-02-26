import { Linking, Platform } from 'react-native';

export function openInGoogleMaps(lat: number, lng: number, label?: string, locationContext?: string) {
  // Build geo-aware search query — always include name so Google Maps opens the real Places entry
  // 1. Label + address → "Eiffel Tower, Champ de Mars, Paris, France"
  // 2. Label without address → name-based search centered at coordinates via @lat,lng,17z
  // 3. No label → coordinates only
  const nativeQuery = label ? encodeURIComponent(label) : `${lat},${lng}`;

  let webUrl: string;
  if (label && locationContext && locationContext !== label) {
    // Best case: name + full address → Google finds exact Places entry
    webUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${label}, ${locationContext}`)}`;
  } else if (label) {
    // No address — search by name, centered at coordinates (biases results to correct area)
    webUrl = `https://www.google.com/maps/search/${encodeURIComponent(label)}/@${lat},${lng},17z`;
  } else {
    webUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  const url = Platform.select({
    ios: `comgooglemaps://?q=${nativeQuery}&center=${lat},${lng}`,
    android: `geo:${lat},${lng}?q=${nativeQuery}`,
    default: webUrl,
  });
  if (Platform.OS === 'ios') {
    Linking.canOpenURL(url!).then(supported => {
      Linking.openURL(supported ? url! : webUrl);
    });
  } else {
    Linking.openURL(url!);
  }
}

export function openGoogleMapsDirections(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  waypoints?: { lat: number; lng: number }[],
  travelMode: string = 'driving',
) {
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&travelmode=${travelMode}`;
  if (waypoints && waypoints.length > 0) {
    const wp = waypoints.map(w => `${w.lat},${w.lng}`).join('|');
    url += `&waypoints=${wp}`;
  }
  Linking.openURL(url);
}
