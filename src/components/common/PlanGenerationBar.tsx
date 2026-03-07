import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { usePlanGeneration } from '../../contexts/PlanGenerationContext';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { Icon } from '../../utils/icons';

export const PlanGenerationBar: React.FC = () => {
  const { isGenerating, completed, progress, tripId, destination, cancelGeneration, dismissCompleted, clientProgress } = usePlanGeneration();
  const navigation = useNavigation<any>();
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Animate progress bar
  useEffect(() => {
    if (progress && progress.total_days > 0) {
      const fraction = progress.current_day / progress.total_days;
      Animated.timing(progressAnim, {
        toValue: fraction,
        duration: 400,
        useNativeDriver: false,
      }).start();
    } else if (progress?.phase === 'structure') {
      Animated.timing(progressAnim, {
        toValue: 0.05,
        duration: 600,
        useNativeDriver: false,
      }).start();
    }
  }, [progress, progressAnim]);

  // Pulse animation during generation
  useEffect(() => {
    if (!isGenerating) {
      pulseAnim.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [isGenerating, pulseAnim]);

  if (!isGenerating && !completed) return null;

  const handlePress = () => {
    if (tripId) {
      navigation.navigate('Itinerary', { tripId });
      if (completed) dismissCompleted();
    }
  };

  const getStatusText = () => {
    if (completed) {
      return destination ? `${destination} — Reiseplan fertig!` : 'Reiseplan fertig!';
    }
    if (!progress) return 'Generierung wird gestartet...';
    if (progress.phase === 'structure') return 'Struktur wird erstellt...';
    if (progress.phase === 'activities') {
      if (progress.current_day === 0) return 'Aktivitäten werden geplant...';
      const pct = Math.round((progress.current_day / progress.total_days) * 100);
      return `Tag ${progress.current_day}/${progress.total_days} (${pct}%)`;
    }
    return 'Generierung läuft...';
  };

  return (
    <TouchableOpacity
      style={[styles.container, completed && styles.containerCompleted]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <Animated.View style={{ opacity: pulseAnim, marginRight: spacing.sm }}>
        <Icon
          name={completed ? 'checkmark-circle' : 'sparkles'}
          size={18}
          color="#FFFFFF"
        />
      </Animated.View>

      <View style={styles.content}>
        <View style={styles.statusRow}>
          <Text style={styles.statusText} numberOfLines={1}>
            {getStatusText()}
          </Text>
          {destination && !completed && (
            <Text style={styles.destinationText} numberOfLines={1}> — {destination}</Text>
          )}
        </View>
        {isGenerating && (
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        )}
      </View>

      {isGenerating && (
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={cancelGeneration}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="close" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      )}

      {completed && (
        <View style={styles.completedActions}>
          {tripId && (
            <Text style={styles.arrowText}>›</Text>
          )}
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={dismissCompleted}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="close" size={14} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    minHeight: 48,
  },
  containerCompleted: {
    backgroundColor: colors.success,
  },
  content: {
    flex: 1,
    marginRight: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    ...typography.bodySmall,
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
    flexShrink: 0,
  },
  destinationText: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    flexShrink: 1,
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  cancelButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  arrowText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '300',
  },
  dismissButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
