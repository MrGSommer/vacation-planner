import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../../components/common';
import { colors, spacing, typography, gradients } from '../../utils/theme';
import { Icon } from '../../utils/icons';
import { supabase } from '../../api/supabase';
import { logError } from '../../services/errorLogger';

const SUPABASE_URL = supabase.supabaseUrl;

type Props = NativeStackScreenProps<any>;

export const WaitlistConfirmScreen: React.FC<Props> = ({ navigation, route }) => {
  const [status, setStatus] = useState<'loading' | 'success' | 'already' | 'error'>('loading');
  const token = (route.params as any)?.token
    || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') : null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    confirmToken();
  }, [token]);

  const confirmToken = async () => {
    try {
      // Call the confirm-waitlist edge function which has service_role access
      const res = await fetch(`${SUPABASE_URL}/functions/v1/confirm-waitlist?token=${encodeURIComponent(token)}`);
      const html = await res.text();

      // Parse result from the HTML response
      if (html.includes('bereits best\u00e4tigt')) {
        setStatus('already');
      } else if (html.includes('E-Mail best\u00e4tigt')) {
        setStatus('success');
      } else {
        setStatus('error');
      }
    } catch (e) {
      logError(e, { component: 'WaitlistConfirmScreen', context: { action: 'confirmToken' } });
      setStatus('error');
    }
  };

  if (status === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Wird bestätigt...</Text>
      </View>
    );
  }

  const isSuccess = status === 'success' || status === 'already';
  const title = isSuccess ? 'E-Mail bestätigt!' : 'Ungültiger Link';
  const message = status === 'success'
    ? 'Vielen Dank! Deine E-Mail-Adresse wurde bestätigt. Wir benachrichtigen dich, sobald WayFable für dich bereit ist.'
    : status === 'already'
    ? 'Deine E-Mail-Adresse wurde bereits bestätigt. Wir melden uns, sobald WayFable für dich bereit ist!'
    : 'Dieser Bestätigungslink ist ungültig oder abgelaufen.';
  const icon = isSuccess ? 'checkmark-circle-outline' : 'close-circle-outline';

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={isSuccess ? [...gradients.ocean] : ['#EF4444', '#F97316']}
        style={styles.gradient}
      >
        <Icon name={icon as any} size={64} color="#FFFFFF" />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <Button
          title="Zur Startseite"
          onPress={() => navigation.navigate('Auth')}
          style={styles.button}
          textStyle={{ color: colors.primary }}
        />
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md },
  gradient: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { ...typography.h1, color: '#FFFFFF', marginTop: spacing.lg, marginBottom: spacing.md },
  message: { ...typography.body, color: 'rgba(255,255,255,0.9)', textAlign: 'center', lineHeight: 24, marginBottom: spacing.xl, maxWidth: 400 },
  button: { backgroundColor: '#FFFFFF', minWidth: 200 },
});
