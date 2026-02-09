import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/common';
import { useToast } from '../../contexts/ToastContext';
import { submitFeedback, getMyFeedback, BetaFeedback } from '../../api/feedback';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';

type Props = {};

const TYPES = [
  { key: 'bug' as const, label: 'Bug', icon: '!', color: colors.error },
  { key: 'feature' as const, label: 'Feature', icon: '+', color: colors.secondary },
  { key: 'feedback' as const, label: 'Feedback', icon: '*', color: colors.primary },
  { key: 'question' as const, label: 'Frage', icon: '?', color: '#FF9800' },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: 'Neu', color: colors.textLight },
  in_progress: { label: 'In Bearbeitung', color: '#FF9800' },
  resolved: { label: 'Erledigt', color: '#4CAF50' },
  wont_fix: { label: 'Abgelehnt', color: colors.error },
};

export const FeedbackScreen: React.FC<Props> = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { showToast } = useToast();
  const [type, setType] = useState<'bug' | 'feature' | 'feedback' | 'question'>('feedback');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedbacks, setFeedbacks] = useState<BetaFeedback[]>([]);
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(true);

  useEffect(() => {
    loadFeedbacks();
  }, []);

  const loadFeedbacks = async () => {
    try {
      const data = await getMyFeedback();
      setFeedbacks(data);
    } catch {
      // ignore
    } finally {
      setLoadingFeedbacks(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      showToast('Bitte Titel und Beschreibung ausfuellen', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await submitFeedback({ type, title: title.trim(), description: description.trim() });
      showToast('Feedback gesendet! Danke!', 'success');
      setTitle('');
      setDescription('');
      loadFeedbacks();
    } catch {
      showToast('Feedback konnte nicht gesendet werden', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Back button (when opened as modal/stack screen) */}
      {navigation.canGoBack() && (
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>{'← Zurück'}</Text>
        </TouchableOpacity>
      )}

      {/* Header */}
      <Text style={styles.title}>Feedback</Text>
      <Text style={styles.subtitle}>Hilf uns WayFable zu verbessern! Melde Bugs, schlage Features vor oder teile dein Feedback.</Text>

      {/* Type selector */}
      <View style={styles.typeRow}>
        {TYPES.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.typeBtn, type === t.key && { backgroundColor: t.color, borderColor: t.color }]}
            onPress={() => setType(t.key)}
          >
            <Text style={[styles.typeText, type === t.key && styles.typeTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Form */}
      <TextInput
        style={styles.input}
        placeholder="Titel (kurz und praeegnant)"
        placeholderTextColor={colors.textLight}
        value={title}
        onChangeText={setTitle}
        maxLength={100}
      />
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Beschreibung (was ist passiert? was hast du erwartet?)"
        placeholderTextColor={colors.textLight}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
        maxLength={2000}
        textAlignVertical="top"
      />
      <Button
        title="Feedback senden"
        onPress={handleSubmit}
        loading={submitting}
        disabled={!title.trim() || !description.trim()}
      />

      {/* Previous feedbacks */}
      {feedbacks.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Dein bisheriges Feedback</Text>
          {feedbacks.map(fb => {
            const statusInfo = STATUS_LABELS[fb.status] || STATUS_LABELS.new;
            return (
              <View key={fb.id} style={styles.feedbackCard}>
                <View style={styles.feedbackHeader}>
                  <View style={[styles.typeBadge, { backgroundColor: TYPES.find(t => t.key === fb.type)?.color || colors.textLight }]}>
                    <Text style={styles.typeBadgeText}>{TYPES.find(t => t.key === fb.type)?.label || fb.type}</Text>
                  </View>
                  <View style={[styles.statusBadge, { borderColor: statusInfo.color }]}>
                    <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
                  </View>
                </View>
                <Text style={styles.feedbackTitle}>{fb.title}</Text>
                <Text style={styles.feedbackDesc} numberOfLines={3}>{fb.description}</Text>
                <Text style={styles.feedbackDate}>
                  {new Date(fb.created_at).toLocaleDateString('de-CH')}
                </Text>
              </View>
            );
          })}
        </>
      )}

      {loadingFeedbacks && (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xl * 2 },
  backBtn: { marginBottom: spacing.sm },
  backBtnText: { ...typography.body, color: colors.primary, fontWeight: '600' },
  title: { ...typography.h2, textAlign: 'center', marginBottom: spacing.md },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.lg, textAlign: 'center' },
  typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  typeBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  typeText: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  typeTextActive: { color: '#FFFFFF' },
  input: {
    ...typography.body,
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: { minHeight: 120 },
  sectionTitle: { ...typography.h3, marginTop: spacing.xl, marginBottom: spacing.md },
  feedbackCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  feedbackHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  typeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  typeBadgeText: { ...typography.caption, color: '#FFFFFF', fontWeight: '600' },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  statusText: { ...typography.caption, fontWeight: '500' },
  feedbackTitle: { ...typography.body, fontWeight: '600', marginBottom: spacing.xs },
  feedbackDesc: { ...typography.bodySmall, color: colors.textSecondary },
  feedbackDate: { ...typography.caption, color: colors.textLight, marginTop: spacing.sm },
});
