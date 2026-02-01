import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Header, Input, Button } from '../../components/common';
import { useAuth } from '../../hooks/useAuth';
import { colors, spacing, typography } from '../../utils/theme';

type Props = { navigation: NativeStackNavigationProp<any> };

export const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signIn, loading, error, clearError } = useAuth();

  const handleLogin = async () => {
    try {
      await signIn(email.trim(), password);
    } catch {}
  };

  return (
    <View style={styles.container}>
      <Header title="Anmelden" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Willkommen zurück!</Text>
          <Text style={styles.subtitle}>Melde dich an, um deine Reisen zu verwalten</Text>

          {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

          <Input
            label="E-Mail"
            placeholder="deine@email.ch"
            value={email}
            onChangeText={(t) => { setEmail(t); clearError(); }}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Input
            label="Passwort"
            placeholder="Dein Passwort"
            value={password}
            onChangeText={(t) => { setPassword(t); clearError(); }}
            secureTextEntry
          />

          <Button title="Anmelden" onPress={handleLogin} loading={loading} disabled={!email || !password} style={styles.loginButton} />

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
  errorBox: { backgroundColor: '#FFEAEA', padding: spacing.md, borderRadius: 8, marginBottom: spacing.md },
  errorText: { ...typography.bodySmall, color: colors.error },
  loginButton: { marginTop: spacing.md },
  link: { alignItems: 'center', marginTop: spacing.lg },
  linkText: { ...typography.body, color: colors.textSecondary },
  linkBold: { color: colors.primary, fontWeight: '600' },
});
