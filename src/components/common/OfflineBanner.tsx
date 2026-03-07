import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { colors } from '../../utils/theme';

export function OfflineBanner() {
  const isOnline = useNetworkStatus();
  const { pendingCount, syncing } = useOfflineSync();

  if (Platform.OS !== 'web' || isOnline) return null;

  const message = pendingCount > 0
    ? `Offline — ${pendingCount} Aenderung${pendingCount > 1 ? 'en' : ''} warten auf Sync`
    : 'Offline — einige Funktionen sind nicht verfuegbar';

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        {syncing ? 'Synchronisiere...' : message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.warning,
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  text: {
    color: colors.text,
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-SemiBold',
    textAlign: 'center',
  },
});
