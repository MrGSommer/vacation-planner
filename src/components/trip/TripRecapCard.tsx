import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Trip } from '../../types/database';
import { getPhotos } from '../../api/photos';
import { getStopLocations } from '../../api/stops';
import { updateTrip } from '../../api/trips';
import { sendAiMessage, AiMessage } from '../../api/aiChat';
import { trackEvent } from '../../api/analytics';
import { colors, spacing, borderRadius, typography, shadows, iconSize } from '../../utils/theme';
import { Icon } from '../../utils/icons';
import { getDayCount } from '../../utils/dateHelpers';
import { logError } from '../../services/errorLogger';

interface Props {
  trip: Trip;
  activityCount: number;
  totalSpent: number;
}

export const TripRecapCard: React.FC<Props> = ({ trip, activityCount, totalSpent }) => {
  const [photoCount, setPhotoCount] = useState(0);
  const [stopCount, setStopCount] = useState(0);
  const [recap, setRecap] = useState<string | null>(trip.fable_recap || null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [recapError, setRecapError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getPhotos(trip.id).then(p => setPhotoCount(p.length)).catch(() => {}),
      getStopLocations(trip.id).then(s => setStopCount(s.length)).catch(() => {}),
    ]);
    trackEvent('rueckblick_viewed');
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
          content: `Du bist Fable, der charmante Reisebegleiter von WayFable. Schreibe einen witzigen, überraschenden Reise-Rückblick (3-4 Sätze) auf Deutsch.

Reise-Daten:
- Reise: ${trip.name}
- Destination: ${trip.destination}
- Dauer: ${days} Tage
- Aktivitäten: ${activityCount}
- Stopps: ${stopCount}
- Fotos: ${photoCount}
- Budget: ${totalSpent.toFixed(0)} ${trip.currency}

Regeln:
- Sei witzig, warm und überraschend — kein generisches "Was für eine tolle Reise!"
- Erfinde lustige Insights basierend auf den Zahlen (z.B. "Bei ${photoCount} Fotos hast du quasi jede Strassenlaterene dokumentiert" oder "Pro Tag ${(totalSpent / Math.max(days, 1)).toFixed(0)} ${trip.currency} — da hat sich jemand was gegönnt")
- Spiele mit der Destination (lokale Klischees, Eigenheiten, Fun Facts)
- Mach den User zum Helden der Story — übertreibe ruhig
- Kein Emoji, keine Aufzählungen, fliessender Text
- Duze den User`,
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
        .replace(/<memory_add>[\s\S]*?<\/memory_add>/g, '')
        .replace(/<memory_conflict[^>]*>[\s\S]*?<\/memory_conflict>/g, '')
        .replace(/<trip_memory_update>[\s\S]*?<\/trip_memory_update>/g, '')
        .replace(/<trip_memory_add>[\s\S]*?<\/trip_memory_add>/g, '')
        .replace(/<trip_memory_conflict[^>]*>[\s\S]*?<\/trip_memory_conflict>/g, '')
        .trim();
      setRecap(clean);

      // Persist to DB so it's available next time
      updateTrip(trip.id, { fable_recap: clean } as any).catch(e =>
        console.error('Failed to save recap:', e),
      );
    } catch (e: any) {
      logError(e, { component: 'TripRecapCard', context: { action: 'generateRecap' } });
      setRecapError(e.message || 'Rückblick konnte nicht erstellt werden');
    } finally {
      setRecapLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Icon name="sparkles-outline" size={iconSize.md} color={colors.accent} />
        <Text style={styles.title}>Reise-Rückblick</Text>
        {recap && (
          <TouchableOpacity
            style={styles.redoBtn}
            onPress={generateRecap}
            disabled={recapLoading}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {recapLoading ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Icon name="refresh-outline" size={iconSize.sm} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
        )}
      </View>

      {recap ? (
        <View style={styles.recapBox}>
          <Text style={styles.recapText}>{recap}</Text>
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
              <Icon name="sparkles-outline" size={iconSize.md} color={colors.accent} />
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h3,
    flex: 1,
  },
  recapBox: {
    backgroundColor: colors.accent + '10',
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  recapText: {
    ...typography.body,
    color: colors.text,
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
  fableBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent + '10',
    borderRadius: borderRadius.md,
    padding: spacing.md,
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
