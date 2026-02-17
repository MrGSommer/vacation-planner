import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Pressable, ActivityIndicator } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Header, Input, Button } from '../../components/common';
import { PasswordInput } from '../../components/common/PasswordInput';
import { GoogleIcon } from '../../components/common/GoogleIcon';
import { useAuth } from '../../hooks/useAuth';
import { useAuthContext } from '../../contexts/AuthContext';
import { supabase } from '../../api/supabase';
import { colors, spacing, typography, borderRadius, gradients } from '../../utils/theme';

// Default to waitlist mode (safe). Set EXPO_PUBLIC_WAITLIST_MODE=false to enable registration.
const WAITLIST_MODE = process.env.EXPO_PUBLIC_WAITLIST_MODE !== 'false';

type Props = { navigation: NativeStackNavigationProp<any> };

export const SignUpScreen: React.FC<Props> = ({ navigation }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [agbAccepted, setAgbAccepted] = useState(false);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { signUp, signInWithGoogle, loading, error, clearError } = useAuth();
  const { pendingInviteToken } = useAuthContext();

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
      await signUp(email.trim(), password, firstName.trim(), lastName.trim());
      navigation.replace('SignUpSuccess', { email: email.trim() });
    } catch {}
  };

  const handleWaitlist = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setLocalError('Bitte gib deinen Vor- und Nachnamen ein');
      return;
    }
    if (!email.trim()) {
      setLocalError('Bitte gib deine E-Mail-Adresse ein');
      return;
    }
    setWaitlistLoading(true);
    setLocalError(null);
    try {
      const { error: insertError } = await supabase
        .from('waitlist')
        .insert({ email: email.trim().toLowerCase(), full_name: `${firstName.trim()} ${lastName.trim()}`.trim() || null });
      if (insertError) {
        if (insertError.code === '23505') {
          setLocalError('Du stehst bereits auf der Warteliste!');
        } else {
          setLocalError('Etwas ist schiefgelaufen. Versuche es nochmal.');
        }
      } else {
        setWaitlistSuccess(true);
      }
    } catch {
      setLocalError('Etwas ist schiefgelaufen. Versuche es nochmal.');
    } finally {
      setWaitlistLoading(false);
    }
  };

  const displayError = localError || error;

  if (WAITLIST_MODE) {
    if (waitlistSuccess) {
      return (
        <View style={styles.container}>
          <Header title="Warteliste" onBack={() => navigation.goBack()} />
          <View style={styles.successContainer}>
            <LinearGradient colors={[...gradients.ocean]} style={styles.successGradient}>
              <Text style={styles.successIcon}>{'🎉'}</Text>
              <Text style={styles.successTitle}>Du bist dabei!</Text>
              <Text style={styles.successMessage}>
                Wir benachrichtigen dich per E-Mail, sobald WayFable für dich bereit ist.
              </Text>
              <TouchableOpacity style={styles.successButton} onPress={() => navigation.goBack()}>
                <Text style={styles.successButtonText}>Zurück</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <Header title="Warteliste" onBack={() => navigation.goBack()} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.waitlistEmoji}>{'✈️'}</Text>
            <Text style={styles.title}>Bald verfügbar!</Text>
            <Text style={styles.subtitle}>
              WayFable befindet sich aktuell in der Beta-Phase. Trag dich ein und wir melden uns, sobald du loslegen kannst.
            </Text>

            {displayError && <View style={styles.errorBox}><Text style={styles.errorText}>{displayError}</Text></View>}

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Input label="Vorname" placeholder="Vorname" value={firstName} onChangeText={setFirstName} containerStyle={{ flex: 1 }} />
              <Input label="Nachname" placeholder="Nachname" value={lastName} onChangeText={setLastName} containerStyle={{ flex: 1 }} />
            </View>
            <Input label="E-Mail" placeholder="deine@email.ch" value={email} onChangeText={(t) => { setEmail(t); setLocalError(null); }} keyboardType="email-address" autoCapitalize="none" />

            <Button title="Auf die Warteliste" onPress={handleWaitlist} loading={waitlistLoading} disabled={!firstName.trim() || !lastName.trim() || !email.trim()} style={styles.signUpButton} />

            <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.link}>
              <Text style={styles.linkText}>Bereits ein Konto? <Text style={styles.linkBold}>Anmelden</Text></Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
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

          {pendingInviteToken && (
            <View style={styles.inviteBanner}>
              <Text style={styles.inviteBannerText}>Du wurdest zu einer Reise eingeladen! Erstelle ein Konto, um die Einladung anzunehmen.</Text>
            </View>
          )}

          {displayError && <View style={styles.errorBox}><Text style={styles.errorText}>{displayError}</Text></View>}

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Input label="Vorname" placeholder="Vorname" value={firstName} onChangeText={setFirstName} containerStyle={{ flex: 1 }} />
            <Input label="Nachname" placeholder="Nachname" value={lastName} onChangeText={setLastName} containerStyle={{ flex: 1 }} />
          </View>
          <Input label="E-Mail" placeholder="deine@email.ch" value={email} onChangeText={(t) => { setEmail(t); clearError(); }} keyboardType="email-address" autoCapitalize="none" />
          <PasswordInput label="Passwort" placeholder="Mindestens 6 Zeichen" value={password} onChangeText={(t) => { setPassword(t); setLocalError(null); }} />
          <PasswordInput label="Passwort bestätigen" placeholder="Passwort wiederholen" value={confirmPassword} onChangeText={(t) => { setConfirmPassword(t); setLocalError(null); }} />

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

          <Button title="Registrieren" onPress={handleSignUp} loading={loading} disabled={!firstName || !email || !password || !confirmPassword || !agbAccepted} style={styles.signUpButton} />

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>oder</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity style={styles.googleButton} onPress={() => { setGoogleLoading(true); signInWithGoogle().catch(() => setGoogleLoading(false)); }} activeOpacity={0.7} disabled={googleLoading}>
            {googleLoading ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <GoogleIcon size={20} />
            )}
            <Text style={styles.googleButtonText}>Mit Google registrieren</Text>
          </TouchableOpacity>

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
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl, lineHeight: 24 },
  inviteBanner: { backgroundColor: colors.accent + '15', borderLeftWidth: 3, borderLeftColor: colors.accent, padding: spacing.md, borderRadius: 8, marginBottom: spacing.md },
  inviteBannerText: { ...typography.bodySmall, color: colors.accent, fontWeight: '500', lineHeight: 20 },
  errorBox: { backgroundColor: '#FFEAEA', padding: spacing.md, borderRadius: 8, marginBottom: spacing.md },
  errorText: { ...typography.bodySmall, color: colors.error },
  agbRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.md },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm, marginTop: 1 },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  agbText: { ...typography.bodySmall, flex: 1, lineHeight: 20 },
  agbLink: { color: colors.primary, fontWeight: '600' },
  signUpButton: { marginTop: spacing.md },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { ...typography.bodySmall, color: colors.textLight, marginHorizontal: spacing.md },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  googleButtonText: { ...typography.body, fontWeight: '600', color: colors.text },
  link: { alignItems: 'center', marginTop: spacing.lg },
  linkText: { ...typography.body, color: colors.textSecondary },
  linkBold: { color: colors.primary, fontWeight: '600' },
  waitlistEmoji: { fontSize: 48, textAlign: 'center', marginBottom: spacing.md },
  successContainer: { flex: 1 },
  successGradient: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  successIcon: { fontSize: 64, marginBottom: spacing.lg },
  successTitle: { ...typography.h1, color: '#FFFFFF', marginBottom: spacing.md },
  successMessage: { ...typography.body, color: 'rgba(255,255,255,0.9)', textAlign: 'center', lineHeight: 24, marginBottom: spacing.xl },
  successButton: { backgroundColor: '#FFFFFF', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: borderRadius.full },
  successButtonText: { ...typography.button, color: colors.secondary },
});
