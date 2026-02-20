import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../types/navigation';
import { colors, spacing, typography, shadows } from '../../utils/theme';

const TABS = [
  { key: 'TripDetail' as const, icon: '🏠', label: 'Dashboard' },
  { key: 'Itinerary' as const, icon: '📋', label: 'Programm' },
  { key: 'Stops' as const, icon: '🛣️', label: 'Route' },
  { key: 'Budget' as const, icon: '💰', label: 'Budget' },
  { key: 'Packing' as const, icon: '🧳', label: 'Packliste' },
];

interface Props {
  tripId: string;
  activeTab: string;
}

export const BOTTOM_NAV_HEIGHT = 65;

export const TripBottomNav: React.FC<Props> = ({ tripId, activeTab }) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom, height: BOTTOM_NAV_HEIGHT + insets.bottom }]}>
      {TABS.map(tab => {
        const active = tab.key === activeTab;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => {
              if (!active) {
                navigation.replace(tab.key, { tripId });
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.icon}>{tab.icon}</Text>
            <Text style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    height: BOTTOM_NAV_HEIGHT,
    ...shadows.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  tabActive: {
    backgroundColor: colors.primary + '12',
    borderTopWidth: 2,
    borderTopColor: colors.primary,
  },
  icon: { fontSize: 22 },
  label: { ...typography.caption, fontSize: 12, marginTop: 2, color: colors.textSecondary },
  labelActive: { color: colors.primary, fontWeight: '600' },
});
