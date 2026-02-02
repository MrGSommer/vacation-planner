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
import { ACTIVITY_CATEGORIES } from '../../utils/constants';
import { CATEGORY_COLORS, formatCategoryDetail } from '../../utils/categoryFields';
import { colors } from '../../utils/theme';

const API_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  || '';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

const getCategoryIcon = (cat: string) => ACTIVITY_CATEGORIES.find(c => c.id === cat)?.icon || '📌';

function buildInfoContent(act: Activity): string {
  const icon = getCategoryIcon(act.category);
  const catData = act.category_data || {};
  const detail = formatCategoryDetail(act.category, catData);
  let html = `<div style="font-family:sans-serif;min-width:180px"><strong>${icon} ${act.title}</strong>`;
  if (act.location_name) html += `<br/><small>📍 ${act.location_name}</small>`;
  if (detail) html += `<br/><span style="color:${CATEGORY_COLORS[act.category] || '#666'};font-size:13px">${detail}</span>`;
  if (act.description) html += `<br/><small style="color:#636E72">${act.description}</small>`;
  html += '</div>';
  return html;
}

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

      // Activity markers with category-specific styling
      a.filter((act: Activity) => act.location_lat && act.location_lng).forEach((act: Activity) => {
        const pos = { lat: act.location_lat!, lng: act.location_lng! };
        bounds.extend(pos);
        const catColor = CATEGORY_COLORS[act.category] || colors.accent;
        const icon = getCategoryIcon(act.category);

        const marker = new google.maps.Marker({
          position: pos,
          map,
          title: act.title,
          label: { text: icon, fontSize: '14px' },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 16,
            fillColor: catColor,
            fillOpacity: 1,
            strokeColor: '#FFFFFF',
            strokeWeight: 2,
          },
        });

        const infoWindow = new google.maps.InfoWindow({ content: buildInfoContent(act) });
        marker.addListener('click', () => infoWindow.open(map, marker));
      });

      // Transport routes: draw lines between departure and arrival stations
      a.filter((act: Activity) => act.category === 'transport').forEach((act: Activity) => {
        const catData = act.category_data || {};
        const depLat = catData.departure_station_lat;
        const depLng = catData.departure_station_lng;
        const arrLat = catData.arrival_station_lat;
        const arrLng = catData.arrival_station_lng;

        if (depLat && depLng && arrLat && arrLng) {
          const depPos = { lat: depLat, lng: depLng };
          const arrPos = { lat: arrLat, lng: arrLng };
          bounds.extend(depPos);
          bounds.extend(arrPos);

          // Departure marker
          const depMarker = new google.maps.Marker({
            position: depPos,
            map,
            title: catData.departure_station_name || 'Abfahrt',
            label: { text: '🛫', fontSize: '14px' },
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 14,
              fillColor: CATEGORY_COLORS.transport,
              fillOpacity: 0.8,
              strokeColor: '#FFFFFF',
              strokeWeight: 2,
            },
          });
          const depInfo = new google.maps.InfoWindow({ content: buildInfoContent(act) });
          depMarker.addListener('click', () => depInfo.open(map, depMarker));

          // Arrival marker
          const arrMarker = new google.maps.Marker({
            position: arrPos,
            map,
            title: catData.arrival_station_name || 'Ankunft',
            label: { text: '🛬', fontSize: '14px' },
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 14,
              fillColor: CATEGORY_COLORS.transport,
              fillOpacity: 0.8,
              strokeColor: '#FFFFFF',
              strokeWeight: 2,
            },
          });
          const arrInfo = new google.maps.InfoWindow({ content: buildInfoContent(act) });
          arrMarker.addListener('click', () => arrInfo.open(map, arrMarker));

          // Dashed line between departure and arrival
          new google.maps.Polyline({
            path: [depPos, arrPos],
            map,
            strokeColor: CATEGORY_COLORS.transport,
            strokeWeight: 3,
            strokeOpacity: 0,
            icons: [{
              icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, scale: 3, strokeColor: CATEGORY_COLORS.transport },
              offset: '0',
              repeat: '15px',
            }],
          });
        }
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
