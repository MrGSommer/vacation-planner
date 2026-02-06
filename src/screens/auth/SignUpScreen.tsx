import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Header, Input, Button } from '../../components/common';
import { useAuth } from '../../hooks/useAuth';
import { colors, spacing, typography, borderRadius } from '../../utils/theme';

type Props = { navigation: NativeStackNavigationProp<any> };

export const SignUpScreen: React.FC<Props> = ({ navigation }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [agbAccepted, setAgbAccepted] = useState(false);
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
      navigation.replace('SignUpSuccess', { email: email.trim() });
    } catch {}
  };

  const displayError = localError || error;

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

          <Pressable style={styles.agbRow} onPress={() => setAgbAccepted(!agbAccepted)}>
            <View style={[styles.checkbox, agbAccepted && styles.checkboxChecked]}>
              {agbAccepted && <Text style={styles.checkmark}>{'✓'}</Text>}
            </View>
            <Text style={styles.agbText}>
              Ich akzeptiere die{' '}
              <Text style={styles.agbLink} onPress={() => navigation.navigate('AGB' as any)}>AGB</Text>
              {' '}und{' '}
              <Text style={styles.agbLink} onPress={() => navigation.navigate('Datenschutz' as any)}>Datenschutzerklärung</Text>
            </Text>
          </Pressable>

          <Button title="Registrieren" onPress={handleSignUp} loading={loading} disabled={!fullName || !email || !password || !confirmPassword || !agbAccepted} style={styles.signUpButton} />

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
  agbRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.md },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm, marginTop: 1 },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  agbText: { ...typography.bodySmall, flex: 1, lineHeight: 20 },
  agbLink: { color: colors.primary, fontWeight: '600' },
  signUpButton: { marginTop: spacing.md },
  link: { alignItems: 'center', marginTop: spacing.lg },
  linkText: { ...typography.body, color: colors.textSecondary },
  linkBold: { color: colors.primary, fontWeight: '600' },
});
