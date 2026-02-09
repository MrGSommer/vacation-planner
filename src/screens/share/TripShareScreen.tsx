import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Image } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getSharedTrip, ShareTripData } from '../../api/invitations';
import { RootStackParamList } from '../../types/navigation';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { formatDateMedium } from '../../utils/dateHelpers';

type Props = NativeStackScreenProps<RootStackParamList, 'TripShare'>;

export const TripShareScreen: React.FC<Props> = ({ route }) => {
  const { token } = route.params;
  const [data, setData] = useState<ShareTripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await getSharedTrip(token);
        setData(result);
      } catch (e: any) {
        setError(e.message || 'Share-Link nicht gefunden oder ungültig.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Reise wird geladen...</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorIcon}>😕</Text>
        <Text style={styles.errorText}>{error || 'Reise nicht gefunden'}</Text>
      </View>
    );
  }

  const { trip, stops, activities } = data;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {trip.cover_image_url && (
        <Image source={{ uri: trip.cover_image_url }} style={styles.coverImage} />
      )}

      <View style={styles.header}>
        <Text style={styles.title}>{trip.name}</Text>
        <Text style={styles.destination}>{trip.destination}</Text>
        <Text style={styles.dates}>
          {formatDateMedium(trip.start_date)} – {formatDateMedium(trip.end_date)}
        </Text>
      </View>

      {stops.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stopps</Text>
          {stops.map((stop) => (
            <View key={stop.id} style={styles.card}>
              <Text style={styles.cardTitle}>{stop.name}</Text>
              {stop.arrival_date && (
                <Text style={styles.cardSub}>
                  {formatDateMedium(stop.arrival_date)}
                  {stop.departure_date ? ` – ${formatDateMedium(stop.departure_date)}` : ''}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {activities.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Aktivitäten</Text>
          {activities.map((act) => (
            <View key={act.id} style={styles.card}>
              <Text style={styles.cardTitle}>{act.title}</Text>
              <Text style={styles.cardSub}>
                {formatDateMedium(act.date)}
                {act.start_time ? ` · ${act.start_time.slice(0, 5)}` : ''}
                {act.end_time ? ` – ${act.end_time.slice(0, 5)}` : ''}
              </Text>
              {act.location_name && <Text style={styles.cardSub}>{act.location_name}</Text>}
              {act.description && <Text style={styles.cardDesc}>{act.description}</Text>}
            </View>
          ))}
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Möchtest du mitplanen? Registriere dich auf</Text>
        <Text style={styles.footerLink}>wayfable.ch</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: spacing.xl },
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md },
  errorIcon: { fontSize: 48, marginBottom: spacing.md },
  errorText: { ...typography.body, color: colors.error, textAlign: 'center' },
  coverImage: { width: '100%', height: 220, resizeMode: 'cover' },
  header: { padding: spacing.xl, alignItems: 'center' },
  title: { ...typography.h1, textAlign: 'center', marginBottom: spacing.xs },
  destination: { ...typography.h3, color: colors.primary, textAlign: 'center' },
  dates: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  sectionTitle: { ...typography.h3, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  cardTitle: { ...typography.body, fontWeight: '600' },
  cardSub: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  cardDesc: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  footer: { alignItems: 'center', padding: spacing.xl, marginTop: spacing.lg },
  footerText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  footerLink: { ...typography.bodySmall, color: colors.primary, fontWeight: '600', marginTop: spacing.xs },
});
