import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { Header, LoadingScreen } from '../../components/common';
import { getStops } from '../../api/stops';
import { getActivitiesForTrip } from '../../api/itineraries';
import { getTrip } from '../../api/trips';
import { TripStop, Activity, Trip } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { colors } from '../../utils/theme';

const API_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  || '';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

const loadGoogleMaps = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.maps) { resolve(); return; }
    const existing = document.getElementById('google-maps-script');
    if (existing) { existing.addEventListener('load', () => resolve()); return; }
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });
};

export const MapScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);

  const initMap = useCallback(async () => {
    try {
      const [t, s, a] = await Promise.all([
        getTrip(tripId),
        getStops(tripId),
        getActivitiesForTrip(tripId),
      ]);

      await loadGoogleMaps();
      if (!mapRef.current) return;

      const center = s.length > 0
        ? { lat: s[0].lat, lng: s[0].lng }
        : t.destination_lat && t.destination_lng
          ? { lat: t.destination_lat, lng: t.destination_lng }
          : { lat: 47.37, lng: 8.54 };

      const map = new google.maps.Map(mapRef.current, {
        center,
        zoom: 8,
        mapTypeControl: false,
        streetViewControl: false,
      });

      const bounds = new google.maps.LatLngBounds();

      // Stop markers
      s.forEach((stop: TripStop, i: number) => {
        const pos = { lat: stop.lat, lng: stop.lng };
        bounds.extend(pos);
        const marker = new google.maps.Marker({
          position: pos,
          map,
          title: stop.name,
          label: { text: `${i + 1}`, color: '#FFFFFF', fontWeight: 'bold' },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 14,
            fillColor: stop.type === 'overnight' ? colors.primary : colors.secondary,
            fillOpacity: 1,
            strokeColor: '#FFFFFF',
            strokeWeight: 2,
          },
        });
        const infoWindow = new google.maps.InfoWindow({
          content: `<div style="font-family:sans-serif"><strong>${stop.name}</strong><br/>${stop.type === 'overnight' ? `🏨 ${stop.arrival_date && stop.departure_date ? `${stop.arrival_date} – ${stop.departure_date} (${stop.nights} N.)` : `${stop.nights} Nacht/Nächte`}` : '📍 Zwischenstopp'}<br/><small>${stop.address || ''}</small></div>`,
        });
        marker.addListener('click', () => infoWindow.open(map, marker));
      });

      // Activity markers
      a.filter((act: Activity) => act.location_lat && act.location_lng).forEach((act: Activity) => {
        const pos = { lat: act.location_lat!, lng: act.location_lng! };
        bounds.extend(pos);
        const marker = new google.maps.Marker({
          position: pos,
          map,
          title: act.title,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: colors.accent,
            fillOpacity: 1,
            strokeColor: '#FFFFFF',
            strokeWeight: 2,
          },
        });
        const infoWindow = new google.maps.InfoWindow({
          content: `<div style="font-family:sans-serif"><strong>${act.title}</strong><br/><small>${act.location_name || ''}</small></div>`,
        });
        marker.addListener('click', () => infoWindow.open(map, marker));
      });

      // Route via Directions
      if (s.length >= 2) {
        const directionsService = new google.maps.DirectionsService();
        const waypoints = s.slice(1, -1).map((st: TripStop) => ({
          location: new google.maps.LatLng(st.lat, st.lng),
          stopover: true,
        }));
        directionsService.route({
          origin: new google.maps.LatLng(s[0].lat, s[0].lng),
          destination: new google.maps.LatLng(s[s.length - 1].lat, s[s.length - 1].lng),
          waypoints,
          travelMode: google.maps.TravelMode.DRIVING,
        }, (result, status) => {
          if (status === 'OK' && result) {
            new google.maps.DirectionsRenderer({
              map,
              directions: result,
              suppressMarkers: true,
              polylineOptions: {
                strokeColor: colors.primary,
                strokeWeight: 4,
                strokeOpacity: 0.7,
              },
            });
          }
        });
      }

      const hasPoints = s.length > 0 || a.some((act: Activity) => act.location_lat);
      if (hasPoints) map.fitBounds(bounds, 60);
    } catch (e) {
      console.error('Map init error:', e);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { initMap(); }, [initMap]);

  return (
    <View style={styles.container}>
      <Header title="Karte" onBack={() => navigation.goBack()} />
      {loading && <LoadingScreen />}
      <div ref={mapRef} style={{ flex: 1, width: '100%', height: '100%', display: loading ? 'none' : 'block' }} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
