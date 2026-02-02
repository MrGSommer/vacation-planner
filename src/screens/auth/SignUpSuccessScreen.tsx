import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../../components/common';
import { colors, spacing, typography, borderRadius, shadows } from '../../utils/theme';

type Props = NativeStackScreenProps<any, 'SignUpSuccess'>;

export const SignUpSuccessScreen: React.FC<Props> = ({ navigation, route }) => {
  const email = route.params?.email || '';

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.icon}>📧</Text>
        <Text style={styles.title}>E-Mail bestätigen</Text>
        <Text style={styles.text}>
          Wir haben eine Bestätigungs-E-Mail an
        </Text>
        <Text style={styles.email}>{email}</Text>
        <Text style={styles.text}>gesendet.</Text>
        <Text style={styles.hint}>
          Bitte öffne den Link in der E-Mail, um dein Konto zu aktivieren. Prüfe auch den Spam-Ordner.
        </Text>
        <Button
          title="Zur Anmeldung"
          onPress={() => navigation.navigate('Login')}
          style={styles.button}
        />
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.retryLink}>
          <Text style={styles.retryText}>Zurück zur Registrierung</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.xxl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    ...shadows.lg,
  },
  icon: { fontSize: 56, marginBottom: spacing.lg },
  title: { ...typography.h2, textAlign: 'center', marginBottom: spacing.md },
  text: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  email: { ...typography.body, color: colors.primary, fontWeight: '600', textAlign: 'center', marginVertical: spacing.xs },
  hint: { ...typography.bodySmall, color: colors.textLight, textAlign: 'center', marginTop: spacing.md, marginBottom: spacing.xl, lineHeight: 20 },
  button: { width: '100%' },
  retryLink: { marginTop: spacing.md },
  retryText: { ...typography.bodySmall, color: colors.textLight },
});
