import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Header, Input, Button } from '../../components/common';
import { PasswordInput } from '../../components/common/PasswordInput';
import { GoogleIcon } from '../../components/common/GoogleIcon';
import { useAuth } from '../../hooks/useAuth';
import { useAuthContext } from '../../contexts/AuthContext';
import { supabase } from '../../api/supabase';
import { colors, spacing, typography, borderRadius, gradients } from '../../utils/theme';
import { Icon } from '../../utils/icons';
import { trackLandingEvent } from '../../api/landingEvents';
import { trackEvent } from '../../api/analytics';
import { logError } from '../../services/errorLogger';

// Default to waitlist mode (safe). Set EXPO_PUBLIC_WAITLIST_MODE=false to enable registration.
const WAITLIST_MODE = process.env.EXPO_PUBLIC_WAITLIST_MODE !== 'false';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

const REFERRAL_OPTIONS = [
  { label: 'Freunde / Familie', value: 'friends' },
  { label: 'Social Media', value: 'social_media' },
  { label: 'Google', value: 'google' },
  { label: 'Blog / Artikel', value: 'blog' },
  { label: 'Sonstiges', value: 'other' },
];

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
  const [waitlistStatus, setWaitlistStatus] = useState<null | 'confirmed' | 'already_confirmed' | 'has_account'>(null);
  const [referralSource, setReferralSource] = useState('');
  const [userGoal, setUserGoal] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [verificationPhase, setVerificationPhase] = useState<'form' | 'code_sent'>('form');
  const [verificationCode, setVerificationCode] = useState('');
  const [codeSending, setCodeSending] = useState(false);
  const [codeVerifying, setCodeVerifying] = useState(false);
  const { signUp, signInWithGoogle, loading, error, clearError } = useAuth();
  const { pendingInviteToken } = useAuthContext();

  useEffect(() => {
    trackEvent('signup_started', { tier: WAITLIST_MODE ? 'waitlist' : 'free' });
  }, []);

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
      trackEvent('signup_completed', { tier: 'free' });
      trackLandingEvent('registered');
      navigation.replace('SignUpSuccess', { email: email.trim() });
    } catch (e) {
      logError(e, { severity: 'critical', component: 'SignUpScreen', context: { action: 'handleSignUp' } });
    }
  };

  const handleRequestCode = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setLocalError('Bitte gib deinen Vor- und Nachnamen ein');
      return;
    }
    if (!email.trim()) {
      setLocalError('Bitte gib deine E-Mail-Adresse ein');
      return;
    }
    setCodeSending(true);
    setLocalError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/waitlist-send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), first_name: firstName.trim() }),
      });
      const data = await res.json();
      if (data.error === 'rate_limit') {
        setLocalError('Zu viele Anfragen. Bitte warte etwas.');
      } else if (data.error) {
        setLocalError('Code konnte nicht gesendet werden. Versuche es nochmal.');
      } else {
        setVerificationPhase('code_sent');
      }
    } catch (e) {
      logError(e, { severity: 'critical', component: 'SignUpScreen', context: { action: 'handleRequestCode' } });
      setLocalError('Etwas ist schiefgelaufen. Versuche es nochmal.');
    } finally {
      setCodeSending(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      setLocalError('Bitte gib den Code ein');
      return;
    }
    setCodeVerifying(true);
    setLocalError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/waitlist-verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: verificationCode.trim() }),
      });
      const data = await res.json();
      if (data.verified) {
        await handleWaitlistSignup();
      } else if (data.error === 'too_many_attempts') {
        setLocalError('Zu viele Fehlversuche. Bitte fordere einen neuen Code an.');
      } else if (data.error === 'expired') {
        setLocalError('Code abgelaufen. Bitte fordere einen neuen Code an.');
      } else {
        setLocalError('Code ist falsch. Bitte überprüfe deine Eingabe.');
      }
    } catch (e) {
      logError(e, { severity: 'critical', component: 'SignUpScreen', context: { action: 'handleVerifyCode' } });
      setLocalError('Etwas ist schiefgelaufen. Versuche es nochmal.');
    } finally {
      setCodeVerifying(false);
    }
  };

  const handleResendCode = () => {
    setVerificationPhase('form');
    setVerificationCode('');
    setEmail('');
    setLocalError(null);
  };

  const handleWaitlistSignup = async () => {
    setWaitlistLoading(true);
    setLocalError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('waitlist_signup', {
        p_email: email.trim(),
        p_first_name: firstName.trim(),
        p_last_name: lastName.trim(),
        p_referral_source: referralSource || null,
        p_user_goal: userGoal.trim() || null,
      });
      if (rpcError) {
        if (rpcError.message?.includes('email_not_verified')) {
          setLocalError('E-Mail konnte nicht verifiziert werden. Bitte fordere einen neuen Code an.');
          setVerificationPhase('form');
          setVerificationCode('');
        } else {
          setLocalError('Etwas ist schiefgelaufen. Versuche es nochmal.');
        }
      } else {
        const status = data?.status;
        setWaitlistStatus(status);
        if (status === 'confirmed') trackLandingEvent('waitlisted');
      }
    } catch (e) {
      logError(e, { severity: 'critical', component: 'SignUpScreen', context: { action: 'handleWaitlistSignup' } });
      setLocalError('Etwas ist schiefgelaufen. Versuche es nochmal.');
    } finally {
      setWaitlistLoading(false);
    }
  };

  const displayError = localError || error;

  if (WAITLIST_MODE) {
    if (waitlistStatus) {
      const isAlreadyConfirmed = waitlistStatus === 'already_confirmed';
      const isHasAccount = waitlistStatus === 'has_account';

      return (
        <View style={styles.container}>
          <Header title="Warteliste" onBack={() => { setWaitlistStatus(null); }} />
          <View style={styles.successContainer}>
            <LinearGradient colors={[...gradients.ocean]} style={styles.successGradient}>
              <Icon
                name={isHasAccount ? 'person-outline' : 'checkmark-circle-outline'}
                size={48}
                color="#FFFFFF"
              />
              <Text style={styles.successTitle}>
                {isHasAccount
                  ? 'Konto vorhanden'
                  : isAlreadyConfirmed
                  ? 'Bereits eingetragen!'
                  : 'Du bist dabei!'}
              </Text>
              <Text style={styles.successMessage}>
                {isHasAccount
                  ? 'Zu dieser E-Mail-Adresse existiert bereits ein Konto. Melde dich an, um WayFable zu nutzen.'
                  : isAlreadyConfirmed
                  ? 'Deine E-Mail-Adresse ist bereits auf der Warteliste. Wir melden uns, sobald WayFable für dich bereit ist!'
                  : 'Vielen Dank! Du stehst jetzt auf der Warteliste. Wir melden uns, sobald WayFable für dich bereit ist.'}
              </Text>
              {isHasAccount ? (
                <TouchableOpacity style={styles.successButton} onPress={() => navigation.navigate('Login')}>
                  <Text style={styles.successButtonText}>Zur Anmeldung</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.successButton} onPress={() => navigation.goBack()}>
                  <Text style={styles.successButtonText}>Zurück</Text>
                </TouchableOpacity>
              )}
            </LinearGradient>
          </View>
        </View>
      );
    }

    const isCodeSent = verificationPhase === 'code_sent';

    return (
      <View style={styles.container}>
        <Header title="Warteliste" onBack={() => {
          if (isCodeSent) { handleResendCode(); } else { navigation.goBack(); }
        }} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Icon name="airplane-outline" size={48} color={colors.primary} />
            <Text style={styles.title}>Bald verfügbar!</Text>
            <Text style={styles.subtitle}>
              WayFable befindet sich aktuell in der Beta-Phase. Trag dich ein und wir melden uns, sobald du loslegen kannst.
            </Text>

            {displayError && <View style={styles.errorBox}><Text style={styles.errorText}>{displayError}</Text></View>}

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Input label="Vorname" placeholder="Vorname" value={firstName} onChangeText={setFirstName} containerStyle={{ flex: 1 }} editable={!isCodeSent} />
              <Input label="Nachname" placeholder="Nachname" value={lastName} onChangeText={setLastName} containerStyle={{ flex: 1 }} editable={!isCodeSent} />
            </View>
            <View style={isCodeSent ? styles.disabledFieldWrapper : undefined}>
              <Input
                label="E-Mail"
                placeholder="deine@email.ch"
                value={email}
                onChangeText={(t) => { setEmail(t); setLocalError(null); }}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!isCodeSent}
              />
              {isCodeSent && <View style={styles.disabledOverlay} />}
            </View>

            {isCodeSent && (
              <View style={styles.codeSection}>
                <View style={styles.codeSentBanner}>
                  <Icon name="mail-outline" size={20} color={colors.primary} />
                  <Text style={styles.codeSentText}>Code gesendet an <Text style={{ fontWeight: '700' }}>{email}</Text></Text>
                </View>
                <Input
                  label="Bestätigungscode"
                  placeholder="8-stelliger Code"
                  value={verificationCode}
                  onChangeText={(t) => { setVerificationCode(t.replace(/[^0-9]/g, '').slice(0, 8)); setLocalError(null); }}
                  keyboardType="number-pad"
                  maxLength={8}
                />
              </View>
            )}

            {!isCodeSent && (
              <>
                <Text style={styles.fieldLabel}>Wie bist du auf WayFable gestossen?</Text>
                <View style={styles.referralRow}>
                  {REFERRAL_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.referralChip, referralSource === opt.value && styles.referralChipActive]}
                      onPress={() => setReferralSource(referralSource === opt.value ? '' : opt.value)}
                    >
                      <Text style={[styles.referralChipText, referralSource === opt.value && styles.referralChipTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>Was erhoffst du dir von WayFable?</Text>
                <TextInput
                  style={styles.goalInput}
                  placeholder="z.B. Reiseplanung vereinfachen, Inspiration für Reisen..."
                  placeholderTextColor={colors.textLight}
                  value={userGoal}
                  onChangeText={setUserGoal}
                  multiline
                  maxLength={300}
                />
              </>
            )}

            {isCodeSent ? (
              <View style={styles.codeButtonRow}>
                <Button
                  title="Code prüfen"
                  onPress={handleVerifyCode}
                  loading={codeVerifying || waitlistLoading}
                  disabled={verificationCode.length !== 8}
                  style={styles.codeVerifyButton}
                />
                <TouchableOpacity onPress={handleResendCode} style={styles.resendLink}>
                  <Icon name="refresh-outline" size={16} color={colors.primary} />
                  <Text style={styles.resendText}>Code erneut senden</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Button
                title="Code anfordern"
                onPress={handleRequestCode}
                loading={codeSending}
                disabled={!firstName.trim() || !lastName.trim() || !email.trim()}
                style={styles.signUpButton}
              />
            )}

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
              {agbAccepted && <Icon name="checkmark" size={14} color="#FFFFFF" />}
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
  fieldLabel: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
  referralRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  referralChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  referralChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  referralChipText: { ...typography.bodySmall, color: colors.textSecondary },
  referralChipTextActive: { color: '#FFFFFF', fontWeight: '600' },
  goalInput: { ...typography.body, backgroundColor: colors.card, borderRadius: borderRadius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, minHeight: 72, textAlignVertical: 'top', marginBottom: spacing.sm },
  disabledFieldWrapper: { position: 'relative' as const, opacity: 0.5 },
  disabledOverlay: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 },
  codeSection: { marginTop: spacing.sm },
  codeSentBanner: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, backgroundColor: colors.primary + '10', padding: spacing.md, borderRadius: borderRadius.md, marginBottom: spacing.md },
  codeSentText: { ...typography.bodySmall, color: colors.text, flex: 1 },
  codeButtonRow: { marginTop: spacing.md, gap: spacing.md },
  codeVerifyButton: {},
  resendLink: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: spacing.xs, paddingVertical: spacing.sm },
  resendText: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' as const },
  waitlistEmoji: { fontSize: 48, textAlign: 'center', marginBottom: spacing.md },
  successContainer: { flex: 1 },
  successGradient: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  successIcon: { fontSize: 64, marginBottom: spacing.lg },
  successTitle: { ...typography.h1, color: '#FFFFFF', marginBottom: spacing.md },
  successMessage: { ...typography.body, color: 'rgba(255,255,255,0.9)', textAlign: 'center', lineHeight: 24, marginBottom: spacing.xl },
  successButton: { backgroundColor: '#FFFFFF', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: borderRadius.full },
  successButtonText: { ...typography.button, color: colors.secondary },
});
