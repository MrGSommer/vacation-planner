import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdminGuard } from '../../components/admin/AdminGuard';
import { Card } from '../../components/common';
import { adminSendTestEmail, adminSaveEmailTest, adminGetEmailTests, adminConfirmEmailTest } from '../../api/admin';
import { useAuth } from '../../hooks/useAuth';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { EmailTest } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'AdminEmailTest'> };

export const AdminEmailTestScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: boolean; error?: string } | null>(null);
  const [tests, setTests] = useState<EmailTest[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTests = async () => {
    try {
      const data = await adminGetEmailTests(30);
      setTests(data);
    } catch (e) {
      console.error('Load tests error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTests();
  }, []);

  const handleSend = async () => {
    if (!email.trim() || !profile) return;
    setSending(true);
    setResult(null);

    try {
      const res = await adminSendTestEmail(email.trim());
      setResult(res);

      // Save to DB
      const subject = `WayFable E-Mail-Test`;
      await adminSaveEmailTest(profile.id, email.trim(), subject, res.sent, res.error);
      await loadTests();
    } catch (e) {
      const msg = (e as Error).message;
      setResult({ sent: false, error: msg });
      if (profile) {
        await adminSaveEmailTest(profile.id, email.trim(), 'WayFable E-Mail-Test', false, msg).catch(() => {});
        await loadTests();
      }
    } finally {
      setSending(false);
    }
  };

  const handleConfirm = async (testId: string) => {
    try {
      await adminConfirmEmailTest(testId);
      setTests((prev) => prev.map((t) => t.id === testId ? { ...t, manually_confirmed: true, confirmed_at: new Date().toISOString() } : t));
    } catch (e) {
      console.error('Confirm error:', e);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}. ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const getStatusStyle = (test: EmailTest) => {
    if (test.send_success && test.manually_confirmed) return { bg: colors.success + '15', color: colors.success, label: 'Bestätigt' };
    if (test.send_success) return { bg: colors.warning + '20', color: '#B8860B', label: 'Gesendet' };
    return { bg: colors.error + '15', color: colors.error, label: 'Fehler' };
  };

  return (
    <AdminGuard>
      <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>{'<'} Zurück</Text>
          </TouchableOpacity>
          <Text style={styles.title}>E-Mail-Test</Text>
        </View>

        {/* Send Card */}
        <Card style={styles.sendCard}>
          <Text style={styles.sectionTitle}>Test-E-Mail senden</Text>
          <Text style={styles.hint}>Sendet eine WayFable-gebrandete Test-E-Mail über das Gmail-API.</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="empfaenger@example.com"
            placeholderTextColor={colors.textLight}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!email.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!email.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.sendBtnText}>Test senden</Text>
            )}
          </TouchableOpacity>

          {result && (
            <View style={[styles.resultBox, result.sent ? styles.resultSuccess : styles.resultError]}>
              <Text style={[styles.resultText, { color: result.sent ? colors.success : colors.error }]}>
                {result.sent ? 'E-Mail erfolgreich gesendet!' : `Fehler: ${result.error || 'Unbekannt'}`}
              </Text>
            </View>
          )}
        </Card>

        {/* History */}
        <Card style={styles.historyCard}>
          <Text style={styles.sectionTitle}>Test-Historie</Text>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
          ) : tests.length === 0 ? (
            <Text style={styles.emptyText}>Noch keine Tests durchgeführt.</Text>
          ) : (
            tests.map((test) => {
              const status = getStatusStyle(test);
              return (
                <View key={test.id} style={styles.testRow}>
                  <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                    <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                  </View>
                  <View style={styles.testInfo}>
                    <Text style={styles.testEmail} numberOfLines={1}>{test.recipient_email}</Text>
                    <Text style={styles.testDate}>{formatDate(test.created_at)}</Text>
                    {test.send_error && (
                      <Text style={styles.testError} numberOfLines={2}>{test.send_error}</Text>
                    )}
                  </View>
                  {test.send_success && !test.manually_confirmed && (
                    <TouchableOpacity style={styles.confirmBtn} onPress={() => handleConfirm(test.id)}>
                      <Text style={styles.confirmBtnText}>Bestätigen</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </Card>
      </ScrollView>
    </AdminGuard>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, maxWidth: 700, alignSelf: 'center', width: '100%' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl, gap: spacing.md },
  backBtn: { paddingVertical: spacing.xs, paddingRight: spacing.md },
  backText: { ...typography.body, color: colors.primary },
  title: { ...typography.h1 },
  sendCard: { marginBottom: spacing.xl, padding: spacing.lg },
  sectionTitle: { ...typography.h3, marginBottom: spacing.sm },
  hint: { ...typography.bodySmall, marginBottom: spacing.md },
  input: {
    ...typography.body,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: colors.background,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { ...typography.button, color: '#FFFFFF' },
  resultBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.sm,
  },
  resultSuccess: { backgroundColor: colors.success + '15' },
  resultError: { backgroundColor: colors.error + '15' },
  resultText: { ...typography.bodySmall, fontWeight: '500' },
  historyCard: { marginBottom: spacing.xl, padding: spacing.lg },
  emptyText: { ...typography.bodySmall, textAlign: 'center', marginVertical: spacing.lg },
  testRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
    minWidth: 75,
    alignItems: 'center',
  },
  statusText: { ...typography.caption, fontWeight: '600' },
  testInfo: { flex: 1, minWidth: 0 },
  testEmail: { ...typography.body, fontWeight: '500' },
  testDate: { ...typography.caption, color: colors.textLight },
  testError: { ...typography.caption, color: colors.error, marginTop: 2 },
  confirmBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.success + '15',
  },
  confirmBtnText: { ...typography.caption, color: colors.success, fontWeight: '600' },
});
