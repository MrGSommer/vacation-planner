import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '../../components/common';
import { colors, spacing, typography } from '../../utils/theme';

type Props = { navigation: NativeStackNavigationProp<any> };

export const SubscriptionCancelScreen: React.FC<Props> = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{'😔'}</Text>
      <Text style={styles.title}>Abgebrochen</Text>
      <Text style={styles.message}>
        Der Bezahlvorgang wurde abgebrochen. Du kannst jederzeit zurückkommen und upgraden.
      </Text>
      <Button
        title="Zurück zur App"
        onPress={() => navigation.navigate('Main')}
        style={styles.button}
      />
      <Button
        title="Nochmal versuchen"
        onPress={() => navigation.navigate('Subscription')}
        variant="ghost"
        style={styles.retryButton}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 64, marginBottom: spacing.md },
  title: { ...typography.h1, marginBottom: spacing.sm },
  message: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  button: { width: '100%' },
  retryButton: { width: '100%', marginTop: spacing.sm },
});
