import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Trip } from '../../types/database';
import { getPhotos } from '../../api/photos';
import { getStops } from '../../api/stops';
import { sendAiMessage, AiMessage } from '../../api/aiChat';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { getDayCount } from '../../utils/dateHelpers';

interface Props {
  trip: Trip;
  activityCount: number;
  totalSpent: number;
}

export const TripRecapCard: React.FC<Props> = ({ trip, activityCount, totalSpent }) => {
  const [photoCount, setPhotoCount] = useState(0);
  const [stopCount, setStopCount] = useState(0);
  const [recap, setRecap] = useState<string | null>(null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [recapError, setRecapError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getPhotos(trip.id).then(p => setPhotoCount(p.length)).catch(() => {}),
      getStops(trip.id).then(s => setStopCount(s.length)).catch(() => {}),
    ]);
  }, [trip.id]);

  const days = getDayCount(trip.start_date, trip.end_date);

  const handleFableRecap = async () => {
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
      const response = await sendAiMessage('conversation', messages, {
        destination: trip.destination,
        startDate: trip.start_date,
        endDate: trip.end_date,
        currency: trip.currency,
      });
      setRecap(response.content);
    } catch (e: any) {
      setRecapError(e.message || 'Rückblick konnte nicht erstellt werden');
    } finally {
      setRecapLoading(false);
    }
  };

  const stats = [
    { icon: '📅', value: days, label: 'Tage' },
    { icon: '📋', value: activityCount, label: 'Aktivitäten' },
    { icon: '📍', value: stopCount, label: 'Stopps' },
    { icon: '📸', value: photoCount, label: 'Fotos' },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reise-Rückblick</Text>

      <View style={styles.statsGrid}>
        {stats.map(s => (
          <View key={s.label} style={styles.statItem}>
            <Text style={styles.statIcon}>{s.icon}</Text>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {totalSpent > 0 && (
        <View style={styles.budgetRow}>
          <Text style={styles.budgetLabel}>Gesamtausgaben</Text>
          <Text style={styles.budgetValue}>{totalSpent.toFixed(0)} {trip.currency}</Text>
        </View>
      )}

      {recap ? (
        <View style={styles.recapBox}>
          <Text style={styles.recapIcon}>✨</Text>
          <Text style={styles.recapText}>{recap}</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.fableBtn}
          onPress={handleFableRecap}
          disabled={recapLoading}
          activeOpacity={0.7}
        >
          {recapLoading ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <>
              <Text style={styles.fableBtnIcon}>✨</Text>
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
  recapIcon: {
    fontSize: 18,
    marginTop: 2,
  },
  recapText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    lineHeight: 22,
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
