import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Header, Input, Button } from '../../components/common';
import { useAuth } from '../../hooks/useAuth';
import { colors, spacing, typography, borderRadius, shadows } from '../../utils/theme';

type Props = { navigation: NativeStackNavigationProp<any> };

export const SignUpScreen: React.FC<Props> = ({ navigation }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const { signUp, loading, error, clearError } = useAuth();

  const handleSignUp = async () => {
    if (password !== confirmPassword) {
      setLocalError('Passwörter stimmen nicht überein');
      return;
    }
    if (password.length < 6) {
      setLocalError('Passwort muss mindestens 6 Zeichen haben');
      return;
    }
    try {
      setLocalError(null);
      await signUp(email.trim(), password, fullName.trim());
      setShowConfirmation(true);
    } catch {}
  };

  const displayError = localError || error;

  if (showConfirmation) {
    return (
      <View style={styles.container}>
        <Header title="Registrieren" onBack={() => navigation.goBack()} />
        <View style={styles.confirmationContainer}>
          <View style={styles.confirmationCard}>
            <Text style={styles.confirmationIcon}>📧</Text>
            <Text style={styles.confirmationTitle}>E-Mail bestätigen</Text>
            <Text style={styles.confirmationText}>
              Wir haben eine Bestätigungs-E-Mail an{'\n'}
              <Text style={styles.confirmationEmail}>{email}</Text>
              {'\n'}gesendet.
            </Text>
            <Text style={styles.confirmationHint}>
              Bitte öffne den Link in der E-Mail, um dein Konto zu aktivieren.
            </Text>
            <Button
              title="Zur Anmeldung"
              onPress={() => navigation.navigate('Login')}
              style={styles.confirmationButton}
            />
            <TouchableOpacity onPress={() => setShowConfirmation(false)} style={styles.retryLink}>
              <Text style={styles.retryText}>Erneut registrieren</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Registrieren" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Konto erstellen</Text>
          <Text style={styles.subtitle}>Erstelle ein Konto, um loszulegen</Text>

          {displayError && <View style={styles.errorBox}><Text style={styles.errorText}>{displayError}</Text></View>}

          <Input label="Name" placeholder="Dein vollständiger Name" value={fullName} onChangeText={setFullName} />
          <Input label="E-Mail" placeholder="deine@email.ch" value={email} onChangeText={(t) => { setEmail(t); clearError(); }} keyboardType="email-address" autoCapitalize="none" />
          <Input label="Passwort" placeholder="Mindestens 6 Zeichen" value={password} onChangeText={(t) => { setPassword(t); setLocalError(null); }} secureTextEntry />
          <Input label="Passwort bestätigen" placeholder="Passwort wiederholen" value={confirmPassword} onChangeText={(t) => { setConfirmPassword(t); setLocalError(null); }} secureTextEntry />

          <Button title="Registrieren" onPress={handleSignUp} loading={loading} disabled={!fullName || !email || !password || !confirmPassword} style={styles.signUpButton} />

          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.link}>
            <Text style={styles.linkText}>Bereits ein Konto? <Text style={styles.linkBold}>Anmelden</Text></Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: spacing.xxl },
  title: { ...typography.h1, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl },
  errorBox: { backgroundColor: '#FFEAEA', padding: spacing.md, borderRadius: 8, marginBottom: spacing.md },
  errorText: { ...typography.bodySmall, color: colors.error },
  signUpButton: { marginTop: spacing.md },
  link: { alignItems: 'center', marginTop: spacing.lg },
  linkText: { ...typography.body, color: colors.textSecondary },
  linkBold: { color: colors.primary, fontWeight: '600' },
  // Confirmation screen
  confirmationContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  confirmationCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.xxl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    ...shadows.lg,
  },
  confirmationIcon: { fontSize: 56, marginBottom: spacing.md },
  confirmationTitle: { ...typography.h2, textAlign: 'center', marginBottom: spacing.md },
  confirmationText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  confirmationEmail: { color: colors.primary, fontWeight: '600' },
  confirmationHint: { ...typography.bodySmall, color: colors.textLight, textAlign: 'center', marginTop: spacing.md, marginBottom: spacing.xl },
  confirmationButton: { width: '100%' },
  retryLink: { marginTop: spacing.md },
  retryText: { ...typography.bodySmall, color: colors.textLight },
});
