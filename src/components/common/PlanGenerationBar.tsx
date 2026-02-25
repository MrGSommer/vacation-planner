import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { usePlanGeneration } from '../../contexts/PlanGenerationContext';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

export const PlanGenerationBar: React.FC = () => {
  const { isGenerating, completed, progress, tripId, destination, cancelGeneration, dismissCompleted } = usePlanGeneration();
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
      // Indeterminate during structure phase
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
    if (completed) return 'Reiseplan fertig!';
    if (!progress) return 'Generierung wird gestartet...';
    if (progress.phase === 'structure') return 'Struktur wird erstellt...';
    if (progress.phase === 'activities') {
      if (progress.current_day === 0) return 'Aktivitäten werden geplant...';
      return `Tag ${progress.current_day}/${progress.total_days} wird erstellt...`;
    }
    return 'Generierung läuft...';
  };

  const progressFraction = progress && progress.total_days > 0
    ? progress.current_day / progress.total_days
    : 0;

  return (
    <TouchableOpacity
      style={[styles.container, completed && styles.containerCompleted]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <Animated.Text style={[styles.icon, { opacity: pulseAnim }]}>
        {completed ? '\u2728' : '\u2728'}
      </Animated.Text>

      <View style={styles.content}>
        <Text style={styles.statusText} numberOfLines={1}>
          {getStatusText()}
        </Text>
        {destination && !completed && (
          <Text style={styles.destinationText} numberOfLines={1}>{destination}</Text>
        )}
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
          <Text style={styles.cancelText}>✕</Text>
        </TouchableOpacity>
      )}

      {completed && tripId && (
        <Text style={styles.arrowText}>›</Text>
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
  icon: {
    fontSize: 18,
    marginRight: spacing.sm,
  },
  content: {
    flex: 1,
    marginRight: spacing.sm,
  },
  statusText: {
    ...typography.bodySmall,
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  destinationText: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    marginTop: 1,
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
  cancelText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  arrowText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '300',
    marginLeft: spacing.sm,
  },
});
