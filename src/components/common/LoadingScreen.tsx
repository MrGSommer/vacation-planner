import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import { colors } from '../../utils/theme';

export const LoadingScreen: React.FC = () => {
  // Remove the HTML splash loader once React takes over
  useEffect(() => {
    if (Platform.OS === 'web') {
      const loader = document.getElementById('app-loader');
      if (loader) loader.remove();
    }
  }, []);

  return (
    <View style={styles.container}>
      <Image
        source={Platform.OS === 'web' ? '/icon-192.png' : require('../../../assets/icon.png')}
        style={styles.icon}
      />
      <ActivityIndicator size="small" color={colors.primary} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 18,
    marginBottom: 20,
  },
});
