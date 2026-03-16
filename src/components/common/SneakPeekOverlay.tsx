import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../types/navigation';
import { colors, spacing, borderRadius, typography, gradients } from '../../utils/theme';
import { Icon } from '../../utils/icons';

interface Props {
  feature: string;
}

export const SneakPeekOverlay: React.FC<Props> = ({ feature }) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.banner}
        onPress={() => navigation.navigate('Subscription')}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={[...gradients.ocean]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradient}
        >
          <Icon name="lock-closed" size={16} color="#FFFFFF" />
          <Text style={styles.text}>
            Premium-Feature — Upgrade um {feature} zu bearbeiten
          </Text>
          <Icon name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    zIndex: 100,
  },
  banner: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  text: {
    ...typography.bodySmall,
    color: '#FFFFFF',
    fontWeight: '600',
    flex: 1,
  },
});
