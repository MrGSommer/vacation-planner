import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { GradientBackground, Button } from '../../components/common';
import { spacing, typography } from '../../utils/theme';

type Props = { navigation: NativeStackNavigationProp<any> };

export const WelcomeScreen: React.FC<Props> = ({ navigation }) => {
  return (
    <GradientBackground type="sunset">
      <View style={styles.container}>
        <View style={styles.top}>
          <Text style={styles.emoji}>🌴</Text>
          <Text style={styles.title}>Dein Reiseplaner</Text>
          <Text style={styles.subtitle}>Plane, organisiere und teile deine Traumreisen</Text>
        </View>
        <View style={styles.bottom}>
          <Button title="Anmelden" onPress={() => navigation.navigate('Login')} style={styles.button} />
          <Button title="Registrieren" onPress={() => navigation.navigate('SignUp')} variant="secondary" style={[styles.button, styles.registerButton]} />
        </View>
      </View>
    </GradientBackground>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between', padding: spacing.xl },
  top: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 80, marginBottom: spacing.lg },
  title: { ...typography.h1, fontSize: 32, color: '#FFFFFF', textAlign: 'center', marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: 'rgba(255,255,255,0.9)', textAlign: 'center', maxWidth: 280 },
  bottom: { paddingBottom: spacing.xl },
  button: { marginBottom: spacing.md },
  registerButton: { borderColor: '#FFFFFF' },
});
