import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Activity } from '../../types/database';
import { DirectionsResult, formatDuration, formatDistance } from '../../services/directions';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  stops: Activity[];
  travelInfo: Map<string, DirectionsResult>;
}

const formatDE = (dateStr: string) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
};

export const RouteMapModal: React.FC<Props> = ({ visible, onClose, stops, travelInfo }) => {
  const mapRef = useRef<MapView>(null);
  const validStops = stops.filter(s => s.location_lat && s.location_lng);

  const handleMapReady = () => {
    if (validStops.length > 0 && mapRef.current) {
      const coords = validStops.map(s => ({ latitude: s.location_lat!, longitude: s.location_lng! }));
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    }
  };

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
          {validStops.length === 0 ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Keine Stops mit Koordinaten</Text>
            </View>
          ) : (
            <MapView
              ref={mapRef}
              style={styles.map}
              provider={PROVIDER_GOOGLE}
              onMapReady={handleMapReady}
              initialRegion={{
                latitude: validStops[0].location_lat!,
                longitude: validStops[0].location_lng!,
                latitudeDelta: 5,
                longitudeDelta: 5,
              }}
            >
              {validStops.map((stop, i) => {
                const markerColor = stop.category === 'hotel' ? colors.primary : colors.secondary;
                const catLabel = stop.category === 'hotel' ? 'Unterkunft' : 'Zwischenstopp';
                const cd = stop.category_data || {};
                const parts: string[] = [catLabel];
                if (stop.category === 'hotel' && cd.check_in_date) {
                  let dateStr = `Check-in: ${formatDE(cd.check_in_date)}`;
                  if (cd.check_out_date) dateStr += ` — Check-out: ${formatDE(cd.check_out_date)}`;
                  parts.push(dateStr);
                } else if (cd.date) {
                  parts.push(formatDE(cd.date));
                }
                const travel = travelInfo.get(stop.id);
                if (travel) {
                  parts.push(`Anfahrt: ${formatDuration(travel.duration)} · ${formatDistance(travel.distance)}`);
                }
                return (
                  <Marker
                    key={stop.id}
                    coordinate={{ latitude: stop.location_lat!, longitude: stop.location_lng! }}
                    title={`${i + 1}. ${stop.title}`}
                    description={parts.join('\n')}
                  >
                    <View style={[styles.markerContainer, { backgroundColor: markerColor }]}>
                      <Text style={styles.markerText}>{i + 1}</Text>
                    </View>
                  </Marker>
                );
              })}

              {validStops.length >= 2 && (
                <Polyline
                  coordinates={validStops.map(s => ({ latitude: s.location_lat!, longitude: s.location_lng! }))}
                  strokeColor={colors.primary}
                  strokeWidth={3}
                />
              )}
            </MapView>
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
  map: { flex: 1 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { ...typography.body, color: colors.textSecondary },
  markerContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  markerText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
});
