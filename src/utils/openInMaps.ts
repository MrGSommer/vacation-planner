import { Linking, Platform } from 'react-native';

export function openInGoogleMaps(lat: number, lng: number, label?: string) {
  const query = label ? encodeURIComponent(label) : `${lat},${lng}`;
  const url = Platform.select({
    ios: `comgooglemaps://?q=${query}&center=${lat},${lng}`,
    android: `geo:${lat},${lng}?q=${query}`,
    default: `https://www.google.com/maps/search/?api=1&query=${query}`,
  });
  if (Platform.OS === 'ios') {
    Linking.canOpenURL(url!).then(supported => {
      Linking.openURL(
        supported ? url! : `https://www.google.com/maps/search/?api=1&query=${query}`,
      );
    });
  } else {
    Linking.openURL(url!);
  }
}
