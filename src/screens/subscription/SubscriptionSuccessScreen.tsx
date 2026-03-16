import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../../components/common';
import { useAuth } from '../../hooks/useAuth';
import { colors, spacing, typography, gradients, borderRadius } from '../../utils/theme';
import { Icon } from '../../utils/icons';

type Props = { navigation: NativeStackNavigationProp<any> };

export const SubscriptionSuccessScreen: React.FC<Props> = ({ navigation }) => {
  const { refreshProfile } = useAuth();

  // Poll profile to pick up webhook changes (may take a few seconds)
  useEffect(() => {
    refreshProfile?.();
    let count = 0;
    const interval = setInterval(() => {
      refreshProfile?.();
      count++;
      if (count >= 5) clearInterval(interval);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[...gradients.ocean]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Icon name="happy-outline" size={64} color="#FFFFFF" />
        <Text style={styles.title}>Willkommen bei Premium!</Text>
        <Text style={styles.message}>
          Dein Upgrade war erfolgreich. Du hast jetzt Zugriff auf alle Features.
        </Text>
      </LinearGradient>

      <View style={styles.features}>
        {['Unbegrenzte Trips & Kollaborateure', 'Foto-Galerie', 'Routen & Stops', 'Reisebegleiter Fable mit Inspirationen'].map((item, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm }}>
            <Icon name="checkmark-circle" size={20} color={colors.secondary} />
            <Text style={styles.featureItem}>{item}</Text>
          </View>
        ))}
      </View>

      <Button
        title="Los geht's"
        onPress={() => navigation.navigate('Main')}
        style={styles.button}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.xl },
  hero: {
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.xl,
  },
  icon: { marginBottom: spacing.md },
  title: { ...typography.h1, color: '#FFFFFF', textAlign: 'center', marginBottom: spacing.sm },
  message: { ...typography.body, color: 'rgba(255,255,255,0.9)', textAlign: 'center' },
  features: { marginBottom: spacing.xl },
  featureItem: { ...typography.body },
  button: { marginTop: spacing.md },
});
