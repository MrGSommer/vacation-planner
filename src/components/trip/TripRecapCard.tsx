import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Trip } from '../../types/database';
import { getPhotos } from '../../api/photos';
import { getStops } from '../../api/stops';
import { updateTrip } from '../../api/trips';
import { sendAiMessage, AiMessage } from '../../api/aiChat';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { getDayCount } from '../../utils/dateHelpers';

interface Props {
  trip: Trip;
  activityCount: number;
  totalSpent: number;
}

export const TripRecapCard: React.FC<Props> = ({ trip, activityCount, totalSpent }) => {
  const navigation = useNavigation<any>();
  const [photoCount, setPhotoCount] = useState(0);
  const [stopCount, setStopCount] = useState(0);
  const [recap, setRecap] = useState<string | null>(trip.fable_recap || null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [recapError, setRecapError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getPhotos(trip.id).then(p => setPhotoCount(p.length)).catch(() => {}),
      getStops(trip.id).then(s => setStopCount(s.length)).catch(() => {}),
    ]);
  }, [trip.id]);

  // Sync with trip prop if recap was loaded externally
  useEffect(() => {
    if (trip.fable_recap && !recap) {
      setRecap(trip.fable_recap);
    }
  }, [trip.fable_recap]);

  const days = getDayCount(trip.start_date, trip.end_date);

  const generateRecap = async () => {
    setRecapLoading(true);
    setRecapError(null);
    try {
      const messages: AiMessage[] = [
        {
          role: 'user',
          content: `Erstelle einen kurzen, persönlichen Reise-Rückblick (2-3 Sätze) für folgende Reise:
- Reise: ${trip.name}
- Destination: ${trip.destination}
- Dauer: ${days} Tage
- Aktivitäten: ${activityCount}
- Stopps: ${stopCount}
- Fotos: ${photoCount}
- Budget ausgegeben: ${totalSpent.toFixed(0)} ${trip.currency}

Schreibe warm und persönlich auf Deutsch. Fasse zusammen, was diese Reise besonders gemacht haben könnte.`,
        },
      ];
      const response = await sendAiMessage('recap', messages, {
        destination: trip.destination,
        startDate: trip.start_date,
        endDate: trip.end_date,
        currency: trip.currency,
      });
      // Strip any metadata/memory tags that might leak through
      const clean = response.content
        .replace(/<metadata>[\s\S]*?<\/metadata>/g, '')
        .replace(/<memory_update>[\s\S]*?<\/memory_update>/g, '')
        .replace(/<trip_memory_update>[\s\S]*?<\/trip_memory_update>/g, '')
        .trim();
      setRecap(clean);

      // Persist to DB so it's available next time
      updateTrip(trip.id, { fable_recap: clean } as any).catch(e =>
        console.error('Failed to save recap:', e),
      );
    } catch (e: any) {
      setRecapError(e.message || 'Rückblick konnte nicht erstellt werden');
    } finally {
      setRecapLoading(false);
    }
  };

  const stats = [
    { icon: '\uD83D\uDCC5', value: days, label: 'Tage', screen: 'Itinerary', params: { tripId: trip.id } },
    { icon: '\uD83D\uDCCB', value: activityCount, label: 'Aktivitäten', screen: 'Itinerary', params: { tripId: trip.id } },
    { icon: '\uD83D\uDCCD', value: stopCount, label: 'Stopps', screen: 'Stops', params: { tripId: trip.id } },
    { icon: '\uD83D\uDCF8', value: photoCount, label: 'Fotos', screen: 'Photos', params: { tripId: trip.id } },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reise-Rückblick</Text>

      <View style={styles.statsGrid}>
        {stats.map(s => (
          <TouchableOpacity
            key={s.label}
            style={styles.statItem}
            onPress={() => navigation.navigate(s.screen, s.params)}
            activeOpacity={0.7}
          >
            <Text style={styles.statIcon}>{s.icon}</Text>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {totalSpent > 0 && (
        <TouchableOpacity
          style={styles.budgetRow}
          onPress={() => navigation.navigate('Budget', { tripId: trip.id })}
          activeOpacity={0.7}
        >
          <Text style={styles.budgetLabel}>Gesamtausgaben</Text>
          <Text style={styles.budgetValue}>{totalSpent.toFixed(0)} {trip.currency}</Text>
        </TouchableOpacity>
      )}

      {recap ? (
        <View style={styles.recapBox}>
          <Text style={styles.recapIconText}>{'\u2728'}</Text>
          <Text style={styles.recapText}>{recap}</Text>
          <TouchableOpacity
            style={styles.redoBtn}
            onPress={generateRecap}
            disabled={recapLoading}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {recapLoading ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={styles.redoIcon}>{'\u21BB'}</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.fableBtn}
          onPress={generateRecap}
          disabled={recapLoading}
          activeOpacity={0.7}
        >
          {recapLoading ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <>
              <Text style={styles.fableBtnIcon}>{'\u2728'}</Text>
              <View>
                <Text style={styles.fableBtnText}>Fable Rückblick</Text>
                <Text style={styles.fableBtnHint}>1 Inspiration</Text>
              </View>
            </>
          )}
        </TouchableOpacity>
      )}

      {recapError && (
        <Text style={styles.errorText}>{recapError}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadows.md,
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  statValue: {
    ...typography.h3,
    color: colors.primary,
  },
  statLabel: {
    ...typography.caption,
    marginTop: 2,
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginBottom: spacing.md,
  },
  budgetLabel: {
    ...typography.bodySmall,
  },
  budgetValue: {
    ...typography.body,
    fontWeight: '600',
    color: colors.primary,
  },
  recapBox: {
    backgroundColor: colors.accent + '10',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  recapIconText: {
    fontSize: 18,
    marginTop: 2,
  },
  recapText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    lineHeight: 22,
  },
  redoBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  redoIcon: {
    fontSize: 18,
    color: colors.accent,
    fontWeight: '600',
  },
  fableBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent + '10',
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  fableBtnIcon: {
    fontSize: 20,
  },
  fableBtnText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.accent,
  },
  fableBtnHint: {
    ...typography.caption,
    color: colors.textLight,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.sm,
  },
});
