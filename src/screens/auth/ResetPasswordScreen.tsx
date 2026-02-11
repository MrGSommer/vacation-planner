import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Header, Input, Button } from '../../components/common';
import { supabase } from '../../api/supabase';
import { useToast } from '../../contexts/ToastContext';
import { colors, spacing, typography } from '../../utils/theme';
import { RootStackParamList } from '../../types/navigation';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'ResetPassword'> };

export const ResetPasswordScreen: React.FC<Props> = ({ navigation }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const handleUpdate = async () => {
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
      showToast('Passwort erfolgreich geändert', 'success');
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e: any) {
      setError(e.message || 'Passwort konnte nicht geändert werden');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Neues Passwort" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Neues Passwort setzen</Text>
          <Text style={styles.subtitle}>Gib dein neues Passwort ein.</Text>

          {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

          <Input
            label="Neues Passwort"
            placeholder="Mindestens 6 Zeichen"
            value={password}
            onChangeText={(t) => { setPassword(t); setError(null); }}
            secureTextEntry
          />
          <Input
            label="Passwort bestätigen"
            placeholder="Passwort wiederholen"
            value={confirmPassword}
            onChangeText={(t) => { setConfirmPassword(t); setError(null); }}
            secureTextEntry
          />

          <Button
            title="Passwort ändern"
            onPress={handleUpdate}
            loading={loading}
            disabled={!password || !confirmPassword}
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
  errorBox: { backgroundColor: '#FFEAEA', padding: spacing.md, borderRadius: 8, marginBottom: spacing.md },
  errorText: { ...typography.bodySmall, color: colors.error },
  button: { marginTop: spacing.md },
});
