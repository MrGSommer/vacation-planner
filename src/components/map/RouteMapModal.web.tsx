import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { importMapsLibrary } from '../common/PlaceAutocomplete';
import { Activity } from '../../types/database';
import { DirectionsResult, formatDuration, formatDistance } from '../../services/directions';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  stops: Activity[];
  travelInfo: Map<string, DirectionsResult>;
}

export const RouteMapModal: React.FC<Props> = ({ visible, onClose, stops, travelInfo }) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !mapRef.current) return;

    const initMap = async () => {
      try {
        const { Map } = await importMapsLibrary('maps');
        const { AdvancedMarkerElement } = await importMapsLibrary('marker');

        const validStops = stops.filter(s => s.location_lat && s.location_lng);
        if (validStops.length === 0) {
          setError('Keine Stops mit Koordinaten');
          return;
        }

        const bounds = new google.maps.LatLngBounds();
        validStops.forEach(s => bounds.extend({ lat: s.location_lat!, lng: s.location_lng! }));

        const map = new Map(mapRef.current!, {
          mapId: 'route-map',
          disableDefaultUI: true,
          zoomControl: true,
        });
        map.fitBounds(bounds, 50);
        mapInstanceRef.current = map;

        // Add numbered markers with InfoWindows
        const formatDE = (dateStr: string) => {
          if (!dateStr) return '';
          const [y, m, d] = dateStr.split('-');
          return `${d}.${m}.${y}`;
        };

        let openInfoWindow: google.maps.InfoWindow | null = null;

        validStops.forEach((stop, i) => {
          const markerColor = stop.category === 'hotel' ? colors.primary : colors.secondary;
          const pin = document.createElement('div');
          pin.style.cssText = `
            width: 32px; height: 32px; border-radius: 50%;
            background: ${markerColor}; color: white;
            display: flex; align-items: center; justify-content: center;
            font-weight: bold; font-size: 14px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            border: 2px solid white;
            cursor: pointer;
          `;
          pin.textContent = String(i + 1);

          const marker = new AdvancedMarkerElement({
            map,
            position: { lat: stop.location_lat!, lng: stop.location_lng! },
            content: pin,
            title: stop.title,
            gmpClickable: true,
          });

          // Build InfoWindow content
          const catLabel = stop.category === 'hotel' ? 'Unterkunft' : 'Zwischenstopp';
          const cd = stop.category_data || {};
          let dateInfo = '';
          if (stop.category === 'hotel' && cd.check_in_date) {
            dateInfo = `Check-in: ${formatDE(cd.check_in_date)}`;
            if (cd.check_out_date) dateInfo += ` — Check-out: ${formatDE(cd.check_out_date)}`;
          } else if (cd.date) {
            dateInfo = formatDE(cd.date);
          }

          let travelLine = '';
          const travel = travelInfo.get(stop.id);
          if (travel) {
            travelLine = `<div style="margin-top:4px;font-size:12px;color:#636E72;">Anfahrt: ${formatDuration(travel.duration)} · ${formatDistance(travel.distance)}</div>`;
          }

          const infoContent = `
            <div style="font-family:system-ui;max-width:220px;">
              <div style="font-weight:bold;font-size:14px;">${stop.title}</div>
              <div style="font-size:12px;color:${markerColor};margin-top:2px;">${catLabel}</div>
              ${dateInfo ? `<div style="font-size:12px;color:#636E72;margin-top:4px;">${dateInfo}</div>` : ''}
              ${travelLine}
            </div>
          `;

          const infoWindow = new google.maps.InfoWindow({ content: infoContent });

          marker.addEventListener('gmp-click', () => {
            if (openInfoWindow) openInfoWindow.close();
            infoWindow.open({ anchor: marker, map });
            openInfoWindow = infoWindow;
          });
        });

        // Draw route polyline
        if (validStops.length >= 2) {
          const directionsService = new google.maps.DirectionsService();
          const directionsRenderer = new google.maps.DirectionsRenderer({
            map,
            suppressMarkers: true,
            polylineOptions: {
              strokeColor: colors.primary,
              strokeWeight: 4,
              strokeOpacity: 0.7,
            },
          });

          const origin = { lat: validStops[0].location_lat!, lng: validStops[0].location_lng! };
          const dest = { lat: validStops[validStops.length - 1].location_lat!, lng: validStops[validStops.length - 1].location_lng! };
          const waypoints = validStops.slice(1, -1).map(s => ({
            location: { lat: s.location_lat!, lng: s.location_lng! },
            stopover: true,
          }));

          // Determine dominant travel mode from travelInfo
          const modeMap: Record<string, string> = { driving: 'DRIVING', transit: 'TRANSIT', walking: 'WALKING', bicycling: 'BICYCLING' };
          const modes = Array.from(travelInfo.values()).map(t => t.mode).filter(Boolean);
          const dominantMode = modes.length > 0 ? modes[0] : 'driving';
          const gmMode = modeMap[dominantMode] || 'DRIVING';

          try {
            const result = await directionsService.route({
              origin,
              destination: dest,
              waypoints,
              travelMode: google.maps.TravelMode[gmMode as keyof typeof google.maps.TravelMode] || google.maps.TravelMode.DRIVING,
            });
            directionsRenderer.setDirections(result);
          } catch {
            // Fallback: simple polyline
            new google.maps.Polyline({
              map,
              path: validStops.map(s => ({ lat: s.location_lat!, lng: s.location_lng! })),
              strokeColor: colors.primary,
              strokeWeight: 3,
              strokeOpacity: 0.6,
            });
          }
        }
      } catch (e) {
        setError('Karte konnte nicht geladen werden');
      }
    };

    // Small delay to ensure DOM is ready
    const timer = setTimeout(initMap, 100);
    return () => clearTimeout(timer);
  }, [visible, stops]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Route</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>
          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : (
            <div
              ref={mapRef}
              style={{ flex: 1, width: '100%', height: '100%', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  container: { height: '90%', backgroundColor: colors.card, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { ...typography.h3 },
  closeIcon: { fontSize: 20, color: colors.textSecondary },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { ...typography.body, color: colors.textSecondary },
});
