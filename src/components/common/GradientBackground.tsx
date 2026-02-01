import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients } from '../../utils/theme';

interface GradientBackgroundProps {
  children: React.ReactNode;
  type?: 'sunset' | 'ocean';
}

export const GradientBackground: React.FC<GradientBackgroundProps> = ({ children, type = 'sunset' }) => {
  const colorSet = type === 'sunset' ? gradients.sunset : gradients.ocean;
  return (
    <LinearGradient colors={[...colorSet]} style={styles.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      {children}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: { flex: 1 },
});
