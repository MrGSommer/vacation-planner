import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { importMapsLibrary } from '../common/PlaceAutocomplete';
import { Activity } from '../../types/database';
import { DirectionsResult, formatDuration, formatDistance } from '../../services/directions';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { Icon } from '../../utils/icons';

interface Props {
  visible: boolean;
  onClose: () => void;
  stops: Activity[];
  travelInfo: Map<string, DirectionsResult>;
  isRoundTrip?: boolean;
  transportActivities?: Activity[];
}

function getStopDate(stop: Activity): string | undefined {
  const cd = stop.category_data || {};
  if (stop.category === 'hotel') return cd.check_in_date;
  return cd.date;
}

function findTransportForSegment(
  prevStop: Activity,
  nextStop: Activity,
  transportActivities: Activity[],
): Activity | null {
  const prevDate = getStopDate(prevStop) || '';
  const nextDate = getStopDate(nextStop) || '9999-12-31';
  for (const t of transportActivities) {
    const tDate = t.category_data?.departure_date;
    if (!tDate) continue;
    if (tDate >= prevDate && tDate <= nextDate) return t;
  }
  return null;
}

function getTransportPolylineOptions(transportType: string): google.maps.PolylineOptions {
  switch (transportType) {
    case 'Flug':
      return { strokeColor: '#4A90D9', strokeWeight: 3, strokeOpacity: 0, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, scale: 3, strokeColor: '#4A90D9' }, offset: '0', repeat: '15px' }] };
    case 'Zug':
      return { strokeColor: '#27AE60', strokeWeight: 3, strokeOpacity: 0.8 };
    case 'Bus':
      return { strokeColor: '#E67E22', strokeWeight: 2, strokeOpacity: 0, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.7, scale: 2, strokeColor: '#E67E22' }, offset: '0', repeat: '10px' }] };
    case 'Fähre':
      return { strokeColor: '#4ECDC4', strokeWeight: 3, strokeOpacity: 0, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, scale: 3, strokeColor: '#4ECDC4' }, offset: '0', repeat: '15px' }] };
    case 'Taxi':
      return { strokeColor: '#F1C40F', strokeWeight: 2, strokeOpacity: 0.7 };
    default: // Auto, etc.
      return { strokeColor: '#636E72', strokeWeight: 2, strokeOpacity: 0.6 };
  }
}

export const RouteMapModal: React.FC<Props> = ({ visible, onClose, stops, travelInfo, isRoundTrip, transportActivities }) => {
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
          mapId: '5617c0f0247bb2e3f910e4fd',
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

        // Draw route via Routes API
        if (validStops.length >= 2) {
          const routesLib = await importMapsLibrary('routes');
          const RouteClass = routesLib.Route;

          const origin = { lat: validStops[0].location_lat!, lng: validStops[0].location_lng! };
          const dest = isRoundTrip
            ? origin
            : { lat: validStops[validStops.length - 1].location_lat!, lng: validStops[validStops.length - 1].location_lng! };
          const intermediates = isRoundTrip
            ? validStops.slice(1).map(s => ({ lat: s.location_lat!, lng: s.location_lng! }))
            : validStops.slice(1, -1).map(s => ({ lat: s.location_lat!, lng: s.location_lng! }));

          // Determine dominant travel mode from travelInfo
          const modeMap: Record<string, string> = { driving: 'DRIVING', transit: 'TRANSIT', walking: 'WALKING', bicycling: 'BICYCLING' };
          const modes = Array.from(travelInfo.values()).map(t => t.mode).filter(Boolean);
          const dominantMode = modes.length > 0 ? modes[0] : 'driving';
          const gmMode = modeMap[dominantMode] || 'DRIVING';

          try {
            const { routes: computedRoutes } = await RouteClass.computeRoutes({
              origin,
              destination: dest,
              intermediates,
              travelMode: gmMode,
              fields: ['path'],
            });

            if (computedRoutes?.[0]) {
              const polylines = computedRoutes[0].createPolylines();
              polylines.forEach((pl: any) => {
                pl.setOptions({
                  strokeColor: colors.primary,
                  strokeWeight: 4,
                  strokeOpacity: 0.7,
                });
                pl.setMap(map);
              });
            }
          } catch {
            // Fallback: simple polylines — transport-type-aware if available
            if (transportActivities && transportActivities.length > 0) {
              for (let i = 1; i < validStops.length; i++) {
                const prev = validStops[i - 1];
                const curr = validStops[i];
                const transport = findTransportForSegment(prev, curr, transportActivities);
                const transportType = transport?.category_data?.transport_type || '';
                const opts = transportType ? getTransportPolylineOptions(transportType) : { strokeColor: colors.primary, strokeWeight: 3, strokeOpacity: 0.6 };
                new google.maps.Polyline({
                  map,
                  path: [
                    { lat: prev.location_lat!, lng: prev.location_lng! },
                    { lat: curr.location_lat!, lng: curr.location_lng! },
                  ],
                  ...opts,
                });
              }
              if (isRoundTrip) {
                new google.maps.Polyline({
                  map,
                  path: [
                    { lat: validStops[validStops.length - 1].location_lat!, lng: validStops[validStops.length - 1].location_lng! },
                    { lat: validStops[0].location_lat!, lng: validStops[0].location_lng! },
                  ],
                  strokeColor: colors.primary,
                  strokeWeight: 3,
                  strokeOpacity: 0.6,
                });
              }
            } else {
              const path = validStops.map(s => ({ lat: s.location_lat!, lng: s.location_lng! }));
              if (isRoundTrip) path.push({ lat: validStops[0].location_lat!, lng: validStops[0].location_lng! });
              new google.maps.Polyline({
                map,
                path,
                strokeColor: colors.primary,
                strokeWeight: 3,
                strokeOpacity: 0.6,
              });
            }
          }
        }
      } catch (e) {
        setError('Karte konnte nicht geladen werden');
      }
    };

    // Small delay to ensure DOM is ready
    const timer = setTimeout(initMap, 100);
    return () => clearTimeout(timer);
  }, [visible, stops, transportActivities]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Route</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="close" size={22} color={colors.text} />
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
