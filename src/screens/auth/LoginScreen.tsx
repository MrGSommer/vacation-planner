import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Header, Input, Button } from '../../components/common';
import { PasswordInput } from '../../components/common/PasswordInput';
import { useAuth } from '../../hooks/useAuth';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { colors, spacing, typography, borderRadius } from '../../utils/theme';

const WAITLIST_MODE = process.env.EXPO_PUBLIC_WAITLIST_MODE !== 'false';

type Props = { navigation: NativeStackNavigationProp<any> };

export const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signIn, signInWithGoogle, loading, error, clearError } = useAuth();
  const { pendingInviteToken } = useAuthContext();
  const { showToast } = useToast();

  const handleLogin = async () => {
    try {
      await signIn(email.trim(), password);
      showToast('Willkommen zurück!', 'success');
    } catch {}
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch {}
  };

  return (
    <View style={styles.container}>
      <Header title="Anmelden" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Willkommen zurück!</Text>
          <Text style={styles.subtitle}>Melde dich an, um deine Reisen zu verwalten</Text>

          {pendingInviteToken && (
            <View style={styles.inviteBanner}>
              <Text style={styles.inviteBannerText}>Du wurdest zu einer Reise eingeladen! Melde dich an, um die Einladung anzunehmen.</Text>
            </View>
          )}

          {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

          <Input
            label="E-Mail"
            placeholder="deine@email.ch"
            value={email}
            onChangeText={(t) => { setEmail(t); clearError(); }}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <PasswordInput
            label="Passwort"
            placeholder="Dein Passwort"
            value={password}
            onChangeText={(t) => { setPassword(t); clearError(); }}
          />

          <Button title="Anmelden" onPress={handleLogin} loading={loading} disabled={!email || !password} style={styles.loginButton} />

          {!WAITLIST_MODE && (
            <>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>oder</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity style={styles.googleButton} onPress={handleGoogleLogin} activeOpacity={0.7}>
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.googleButtonText}>Mit Google anmelden</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={styles.link}>
            <Text style={styles.linkText}>Passwort vergessen?</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('SignUp')} style={styles.link}>
            <Text style={styles.linkText}>Noch kein Konto? <Text style={styles.linkBold}>Registrieren</Text></Text>
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
  inviteBanner: { backgroundColor: colors.accent + '15', borderLeftWidth: 3, borderLeftColor: colors.accent, padding: spacing.md, borderRadius: 8, marginBottom: spacing.md },
  inviteBannerText: { ...typography.bodySmall, color: colors.accent, fontWeight: '500', lineHeight: 20 },
  errorBox: { backgroundColor: '#FFEAEA', padding: spacing.md, borderRadius: 8, marginBottom: spacing.md },
  errorText: { ...typography.bodySmall, color: colors.error },
  loginButton: { marginTop: spacing.md },
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
  googleIcon: { fontSize: 18, fontWeight: '700', color: '#4285F4' },
  googleButtonText: { ...typography.body, fontWeight: '600', color: colors.text },
  link: { alignItems: 'center', marginTop: spacing.lg },
  linkText: { ...typography.body, color: colors.textSecondary },
  linkBold: { color: colors.primary, fontWeight: '600' },
});
