import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../../components/common';
import { useAuth } from '../../hooks/useAuth';
import { colors, spacing, typography, gradients, borderRadius } from '../../utils/theme';

type Props = { navigation: NativeStackNavigationProp<any> };

export const SubscriptionSuccessScreen: React.FC<Props> = ({ navigation }) => {
  const { refreshProfile } = useAuth();

  useEffect(() => {
    refreshProfile?.();
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[...gradients.ocean]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.icon}>{'🎉'}</Text>
        <Text style={styles.title}>Willkommen bei Premium!</Text>
        <Text style={styles.message}>
          Dein Upgrade war erfolgreich. Du hast jetzt Zugriff auf alle Features.
        </Text>
      </LinearGradient>

      <View style={styles.features}>
        <Text style={styles.featureItem}>{'✅ Unbegrenzte Trips & Kollaborateure'}</Text>
        <Text style={styles.featureItem}>{'✅ Foto-Galerie'}</Text>
        <Text style={styles.featureItem}>{'✅ Routen & Stops'}</Text>
        <Text style={styles.featureItem}>{'✅ Reisebegleiter Fable mit Inspirationen'}</Text>
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
  icon: { fontSize: 64, marginBottom: spacing.md },
  title: { ...typography.h1, color: '#FFFFFF', textAlign: 'center', marginBottom: spacing.sm },
  message: { ...typography.body, color: 'rgba(255,255,255,0.9)', textAlign: 'center' },
  features: { marginBottom: spacing.xl },
  featureItem: { ...typography.body, marginBottom: spacing.sm },
  button: { marginTop: spacing.md },
});
