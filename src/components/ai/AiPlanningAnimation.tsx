import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { typography, spacing } from '../../utils/theme';
import { gradients } from '../../utils/theme';

const STATUS_TEXTS = [
  'Suche Sehenswuerdigkeiten...',
  'Plane Tagesablaeufe...',
  'Finde Restaurants...',
  'Berechne Budget...',
  'Optimiere Route...',
  'Erstelle Aktivitaeten...',
];

export const AiPlanningAnimation: React.FC = () => {
  const planeX = useRef(new Animated.Value(0)).current;
  const planeY = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(1)).current;
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    // Plane animation: smooth curve path
    const planeAnimation = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(planeX, { toValue: 1, duration: 3000, useNativeDriver: true }),
          Animated.timing(planeY, { toValue: 1, duration: 1500, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(planeX, { toValue: 0, duration: 3000, useNativeDriver: true }),
          Animated.timing(planeY, { toValue: 0, duration: 1500, useNativeDriver: true }),
        ]),
      ]),
    );
    planeAnimation.start();

    // Rotating status text
    const textInterval = setInterval(() => {
      Animated.timing(textOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setStatusIndex(prev => (prev + 1) % STATUS_TEXTS.length);
        Animated.timing(textOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      });
    }, 2500);

    return () => {
      planeAnimation.stop();
      clearInterval(textInterval);
    };
  }, []);

  const translateX = planeX.interpolate({
    inputRange: [0, 1],
    outputRange: [-60, 60],
  });
  const translateY = planeY.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -30, 0],
  });

  return (
    <LinearGradient colors={[...gradients.ocean]} style={styles.container}>
      <Animated.Text
        style={[
          styles.plane,
          { transform: [{ translateX }, { translateY }] },
        ]}
      >
        {'✈️'}
      </Animated.Text>

      <Animated.Text style={[styles.statusText, { opacity: textOpacity }]}>
        {STATUS_TEXTS[statusIndex]}
      </Animated.Text>

      <Text style={styles.subtitle}>Dein Reiseplan wird erstellt</Text>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  plane: {
    fontSize: 48,
    marginBottom: spacing.xl,
  },
  statusText: {
    ...typography.h3,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.bodySmall,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
});
