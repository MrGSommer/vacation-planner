import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Header, Input, Button } from '../../components/common';
import { PasswordInput } from '../../components/common/PasswordInput';
import { supabase } from '../../api/supabase';
import { updateProfile } from '../../api/auth';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { colors, spacing, typography } from '../../utils/theme';
import { RootStackParamList } from '../../types/navigation';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'ResetPassword'> };

// Detect if this was reached via invite flow (user was invited, needs to set password)
const isInviteFlow = (() => {
  if (Platform.OS === 'web') {
    try {
      const fullUrl = window.location.href;
      const hash = window.location.hash;
      return hash.includes('type=invite') || fullUrl.includes('type=invite');
    } catch { return false; }
  }
  return false;
})();

export const ResetPasswordScreen: React.FC<Props> = ({ navigation }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, refreshProfile } = useAuthContext();
  const { showToast } = useToast();

  const handleUpdate = async () => {
    if (isInviteFlow && !firstName.trim()) {
      setError('Bitte gib deinen Vornamen ein');
      return;
    }
    if (password.length < 6) {
      setError('Passwort muss mindestens 6 Zeichen haben');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwörter stimmen nicht überein');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      // Save name for invite flow
      if (isInviteFlow && user) {
        await updateProfile(user.id, {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        });
        await refreshProfile();
      }

      showToast(isInviteFlow ? 'Willkommen bei WayFable!' : 'Passwort erfolgreich geändert', 'success');
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e: any) {
      setError(e.message || 'Passwort konnte nicht geändert werden');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title={isInviteFlow ? 'Willkommen!' : 'Neues Passwort'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>
            {isInviteFlow ? 'Willkommen bei WayFable!' : 'Neues Passwort setzen'}
          </Text>
          <Text style={styles.subtitle}>
            {isInviteFlow
              ? 'Vervollständige dein Profil und setze dein Passwort.'
              : 'Gib dein neues Passwort ein.'}
          </Text>

          {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

          {isInviteFlow && (
            <View style={styles.nameRow}>
              <Input
                label="Vorname"
                placeholder="Vorname"
                value={firstName}
                onChangeText={(t) => { setFirstName(t); setError(null); }}
                style={styles.nameInput}
              />
              <Input
                label="Nachname"
                placeholder="Nachname"
                value={lastName}
                onChangeText={(t) => { setLastName(t); setError(null); }}
                style={styles.nameInput}
              />
            </View>
          )}

          <PasswordInput
            label="Neues Passwort"
            placeholder="Mindestens 6 Zeichen"
            value={password}
            onChangeText={(t) => { setPassword(t); setError(null); }}
          />
          <PasswordInput
            label="Passwort bestätigen"
            placeholder="Passwort wiederholen"
            value={confirmPassword}
            onChangeText={(t) => { setConfirmPassword(t); setError(null); }}
          />

          <Button
            title={isInviteFlow ? 'Konto aktivieren' : 'Passwort ändern'}
            onPress={handleUpdate}
            loading={loading}
            disabled={isInviteFlow ? (!firstName.trim() || !password || !confirmPassword) : (!password || !confirmPassword)}
            style={styles.button}
          />
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
  nameRow: { flexDirection: 'row', gap: spacing.sm },
  nameInput: { flex: 1 },
  errorBox: { backgroundColor: '#FFEAEA', padding: spacing.md, borderRadius: 8, marginBottom: spacing.md },
  errorText: { ...typography.bodySmall, color: colors.error },
  button: { marginTop: spacing.md },
});
