import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Activity, TripStop } from '../../types/database';
import { CATEGORY_COLORS } from '../../utils/categoryFields';
import { getActivityIcon } from '../../utils/constants';
import { colors, spacing, typography } from '../../utils/theme';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

interface Props {
  tripId: string;
  activities: Activity[];
  stops: TripStop[];
  isRoundTrip?: boolean;
}

export const OfflineMapView: React.FC<Props> = ({ tripId, activities, stops, isRoundTrip }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);

  // Compute center and zoom from activities + stops
  const { center, zoom } = useMemo(() => {
    const points: { lat: number; lng: number }[] = [];
    stops.forEach(s => points.push({ lat: s.lat, lng: s.lng }));
    activities
      .filter(a => a.location_lat && a.location_lng)
      .forEach(a => points.push({ lat: a.location_lat!, lng: a.location_lng! }));

    if (points.length === 0) return { center: [8.54, 47.37] as [number, number], zoom: 8 };
    if (points.length === 1) return { center: [points[0].lng, points[0].lat] as [number, number], zoom: 13 };

    let south = 90, north = -90, west = 180, east = -180;
    for (const p of points) {
      if (p.lat < south) south = p.lat;
      if (p.lat > north) north = p.lat;
      if (p.lng < west) west = p.lng;
      if (p.lng > east) east = p.lng;
    }
    const cLat = (south + north) / 2;
    const cLng = (west + east) / 2;
    const latDiff = north - south;
    const lngDiff = east - west;
    const maxDiff = Math.max(latDiff, lngDiff);
    const z = maxDiff > 5 ? 6 : maxDiff > 2 ? 8 : maxDiff > 0.5 ? 10 : 13;
    return { center: [cLng, cLat] as [number, number], zoom: z };
  }, [activities, stops]);

  useEffect(() => {
    if (!mapContainerRef.current || !MAPBOX_TOKEN) return;

    // Dynamic import to avoid Metro bundling issues
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;

      // Load CSS
      if (!document.getElementById('mapbox-gl-css')) {
        const link = document.createElement('link');
        link.id = 'mapbox-gl-css';
        link.rel = 'stylesheet';
        link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.css';
        document.head.appendChild(link);
      }

      if (cancelled || !mapContainerRef.current) return;

      mapboxgl.accessToken = MAPBOX_TOKEN;
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/programmablework/cmmrxrype008e01sgbdb12881',
        center,
        zoom,
      });
      mapRef.current = map;

      map.on('load', () => {
        // Stop markers (numbered)
        stops.forEach((stop, i) => {
          const el = document.createElement('div');
          el.style.cssText = `
            width:32px;height:32px;border-radius:16px;
            background:${stop.type === 'overnight' ? colors.primary : colors.secondary};
            border:2px solid white;display:flex;align-items:center;justify-content:center;
            color:white;font-weight:bold;font-size:14px;
            box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;
          `;
          el.textContent = `${i + 1}`;
          el.title = stop.name;
          new mapboxgl.Marker({ element: el })
            .setLngLat([stop.lng, stop.lat])
            .addTo(map);
        });

        // Activity markers
        activities
          .filter(a => a.location_lat && a.location_lng)
          .forEach(a => {
            const catColor = CATEGORY_COLORS[a.category] || colors.accent;
            const icon = getActivityIcon(a.category, a.category_data);
            const el = document.createElement('div');
            el.style.cssText = `
              width:32px;height:32px;border-radius:16px;
              background:${catColor};border:2px solid white;
              display:flex;align-items:center;justify-content:center;
              font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;
            `;
            el.textContent = icon;
            el.title = a.title;
            new mapboxgl.Marker({ element: el })
              .setLngLat([a.location_lng!, a.location_lat!])
              .addTo(map);
          });

        // Route line between stops
        if (stops.length >= 2) {
          const coords = stops.map(s => [s.lng, s.lat]);
          if (isRoundTrip) coords.push([stops[0].lng, stops[0].lat]);
          map.addSource('route-line', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: coords },
            },
          });
          map.addLayer({
            id: 'route-line-layer',
            type: 'line',
            source: 'route-line',
            paint: {
              'line-color': colors.primary,
              'line-width': 3,
              'line-opacity': 0.6,
              'line-dasharray': [2, 2],
            },
          });
        }
      });
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [center, zoom, activities, stops]);

  return (
    <View style={styles.container}>
      {/* Offline banner */}
      <View style={styles.offlineBanner}>
        <Text style={styles.offlineBannerText}>
          Offline-Modus — Verbindung wird gesucht...
        </Text>
      </View>
      <div ref={mapContainerRef} style={{ flex: 1, width: '100%', height: '100%' }} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  offlineBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: colors.warning + 'E6',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  offlineBannerText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
});
