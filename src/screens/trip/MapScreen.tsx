import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Header, Card } from '../../components/common';
import { getActivitiesForTrip } from '../../api/itineraries';
import { getTrip } from '../../api/trips';
import { Activity } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { ACTIVITY_CATEGORIES } from '../../utils/constants';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

export const MapScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const mapRef = useRef<MapView>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selected, setSelected] = useState<Activity | null>(null);
  const [region, setRegion] = useState({
    latitude: 47.3769,
    longitude: 8.5417,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const trip = await getTrip(tripId);
        if (trip.destination_lat && trip.destination_lng) {
          setRegion(r => ({ ...r, latitude: trip.destination_lat!, longitude: trip.destination_lng! }));
        }
        const acts = await getActivitiesForTrip(tripId);
        setActivities(acts.filter(a => a.location_lat && a.location_lng));

        if (acts.length > 0 && mapRef.current) {
          const coords = acts.filter(a => a.location_lat && a.location_lng).map(a => ({
            latitude: a.location_lat!,
            longitude: a.location_lng!,
          }));
          if (coords.length > 0) {
            mapRef.current.fitToCoordinates(coords, { edgePadding: { top: 80, right: 40, bottom: 200, left: 40 }, animated: true });
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, [tripId]);

  const getCategoryIcon = (cat: string) => ACTIVITY_CATEGORIES.find(c => c.id === cat)?.icon || '📌';

  const routeCoords = activities
    .filter(a => a.location_lat && a.location_lng)
    .map(a => ({ latitude: a.location_lat!, longitude: a.location_lng! }));

  return (
    <View style={styles.container}>
      <Header title="Karte" onBack={() => navigation.goBack()} />
      <MapView ref={mapRef} style={styles.map} initialRegion={region} showsUserLocation showsMyLocationButton>
        {activities.map(activity => (
          <Marker
            key={activity.id}
            coordinate={{ latitude: activity.location_lat!, longitude: activity.location_lng! }}
            title={activity.title}
            description={activity.location_name || undefined}
            onPress={() => setSelected(activity)}
          />
        ))}
        {routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeColor={colors.primary} strokeWidth={3} />
        )}
      </MapView>

      {selected && (
        <Card style={styles.bottomSheet}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setSelected(null)}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.sheetContent}>
            <Text style={styles.sheetIcon}>{getCategoryIcon(selected.category)}</Text>
            <View style={styles.sheetInfo}>
              <Text style={styles.sheetTitle}>{selected.title}</Text>
              {selected.location_name && <Text style={styles.sheetLocation}>📍 {selected.location_name}</Text>}
              {selected.start_time && <Text style={styles.sheetTime}>🕐 {selected.start_time}</Text>}
            </View>
          </View>
          {selected.description && <Text style={styles.sheetDesc}>{selected.description}</Text>}
        </Card>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  bottomSheet: { position: 'absolute', bottom: spacing.xl, left: spacing.md, right: spacing.md, ...shadows.lg },
  closeBtn: { position: 'absolute', top: spacing.sm, right: spacing.sm, zIndex: 1 },
  closeText: { fontSize: 18, color: colors.textLight },
  sheetContent: { flexDirection: 'row', alignItems: 'center' },
  sheetIcon: { fontSize: 32, marginRight: spacing.md },
  sheetInfo: { flex: 1 },
  sheetTitle: { ...typography.h3 },
  sheetLocation: { ...typography.bodySmall, marginTop: 2 },
  sheetTime: { ...typography.caption, color: colors.primary, marginTop: 2 },
  sheetDesc: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.sm },
});
