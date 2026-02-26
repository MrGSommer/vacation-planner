import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Switch } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdminGuard } from '../../components/admin/AdminGuard';
import { Card } from '../../components/common';
import {
  adminGetAllAnnouncements,
  adminCreateAnnouncement,
  adminUpdateAnnouncement,
  adminDeleteAnnouncement,
  adminGetDismissalCount,
} from '../../api/announcements';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { Announcement } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'AdminAnnouncements'> };

const AUDIENCE_OPTIONS: { value: Announcement['target_audience']; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'premium', label: 'Premium' },
  { value: 'free', label: 'Free' },
];

export const AdminAnnouncementsScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [announcements, setAnnouncements] = useState<(Announcement & { dismissCount?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [ctaText, setCtaText] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [audience, setAudience] = useState<Announcement['target_audience']>('all');
  const [priority, setPriority] = useState('0');

  const loadAnnouncements = async () => {
    try {
      const data = await adminGetAllAnnouncements();
      // Load dismiss counts in parallel
      const withCounts = await Promise.all(
        data.map(async (a) => {
          const dismissCount = await adminGetDismissalCount(a.id).catch(() => 0);
          return { ...a, dismissCount };
        })
      );
      setAnnouncements(withCounts);
    } catch (e) {
      console.error('Load announcements error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const handleCreate = async () => {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      await adminCreateAnnouncement({
        title: title.trim(),
        body: body.trim(),
        image_url: imageUrl.trim() || null,
        cta_text: ctaText.trim() || null,
        cta_url: ctaUrl.trim() || null,
        target_audience: audience,
        priority: parseInt(priority, 10) || 0,
        active: true,
      });
      // Reset form
      setTitle('');
      setBody('');
      setImageUrl('');
      setCtaText('');
      setCtaUrl('');
      setAudience('all');
      setPriority('0');
      await loadAnnouncements();
    } catch (e) {
      console.error('Create announcement error:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      await adminUpdateAnnouncement(id, { active: !currentActive });
      setAnnouncements((prev) => prev.map((a) => a.id === id ? { ...a, active: !currentActive } : a));
    } catch (e) {
      console.error('Toggle error:', e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adminDeleteAnnouncement(id);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      console.error('Delete error:', e);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
  };

  return (
    <AdminGuard>
      <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>{'<'} Zurück</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Ankündigungen</Text>
        </View>

        {/* Create Form */}
        <Card style={styles.formCard}>
          <Text style={styles.sectionTitle}>Neue Ankündigung</Text>

          <Text style={styles.label}>Titel *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="z.B. Neue Funktion verfügbar!"
            placeholderTextColor={colors.textLight}
          />

          <Text style={styles.label}>Nachricht *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={body}
            onChangeText={setBody}
            placeholder="Beschreibung der Ankündigung..."
            placeholderTextColor={colors.textLight}
            multiline
            numberOfLines={4}
          />

          <Text style={styles.label}>Bild-URL (optional)</Text>
          <TextInput
            style={styles.input}
            value={imageUrl}
            onChangeText={setImageUrl}
            placeholder="https://..."
            placeholderTextColor={colors.textLight}
            autoCapitalize="none"
          />

          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.label}>Button-Text</Text>
              <TextInput
                style={styles.input}
                value={ctaText}
                onChangeText={setCtaText}
                placeholder="z.B. Jetzt ansehen"
                placeholderTextColor={colors.textLight}
              />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.label}>Button-URL</Text>
              <TextInput
                style={styles.input}
                value={ctaUrl}
                onChangeText={setCtaUrl}
                placeholder="/subscription oder https://..."
                placeholderTextColor={colors.textLight}
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.label}>Zielgruppe</Text>
              <View style={styles.audienceRow}>
                {AUDIENCE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.audienceBtn, audience === opt.value && styles.audienceBtnActive]}
                    onPress={() => setAudience(opt.value)}
                  >
                    <Text style={[styles.audienceBtnText, audience === opt.value && styles.audienceBtnTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.halfField}>
              <Text style={styles.label}>Priorität</Text>
              <TextInput
                style={styles.input}
                value={priority}
                onChangeText={setPriority}
                placeholder="0"
                placeholderTextColor={colors.textLight}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.createBtn, (!title.trim() || !body.trim() || saving) && styles.createBtnDisabled]}
            onPress={handleCreate}
            disabled={!title.trim() || !body.trim() || saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.createBtnText}>Ankündigung erstellen</Text>
            )}
          </TouchableOpacity>
        </Card>

        {/* Existing Announcements */}
        <Card style={styles.listCard}>
          <Text style={styles.sectionTitle}>Bestehende Ankündigungen</Text>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
          ) : announcements.length === 0 ? (
            <Text style={styles.emptyText}>Keine Ankündigungen vorhanden.</Text>
          ) : (
            announcements.map((a) => (
              <View key={a.id} style={styles.announcementRow}>
                <View style={styles.announcementInfo}>
                  <Text style={styles.announcementTitle}>{a.title}</Text>
                  <Text style={styles.announcementBody} numberOfLines={2}>{a.body}</Text>
                  <View style={styles.metaRow}>
                    <View style={[styles.audienceTag, { backgroundColor: colors.accent + '15' }]}>
                      <Text style={[styles.audienceTagText, { color: colors.accent }]}>{a.target_audience}</Text>
                    </View>
                    <Text style={styles.metaText}>P{a.priority}</Text>
                    <Text style={styles.metaText}>{formatDate(a.created_at)}</Text>
                    <Text style={styles.metaText}>{a.dismissCount ?? 0}x gesehen</Text>
                  </View>
                </View>
                <View style={styles.announcementActions}>
                  <View style={styles.switchRow}>
                    <Text style={styles.switchLabel}>Aktiv</Text>
                    <Switch
                      value={a.active}
                      onValueChange={() => handleToggleActive(a.id, a.active)}
                      trackColor={{ false: colors.border, true: colors.success + '80' }}
                      thumbColor={a.active ? colors.success : colors.textLight}
                    />
                  </View>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(a.id)}>
                    <Text style={styles.deleteBtnText}>Löschen</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </AdminGuard>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, maxWidth: 800, alignSelf: 'center', width: '100%' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl, gap: spacing.md },
  backBtn: { paddingVertical: spacing.xs, paddingRight: spacing.md },
  backText: { ...typography.body, color: colors.primary },
  title: { ...typography.h1 },
  formCard: { marginBottom: spacing.xl, padding: spacing.lg },
  sectionTitle: { ...typography.h3, marginBottom: spacing.md },
  label: { ...typography.bodySmall, fontWeight: '600' as any, marginBottom: spacing.xs, color: colors.text },
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
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: spacing.md },
  halfField: { flex: 1 },
  audienceRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md },
  audienceBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  audienceBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  audienceBtnText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  audienceBtnTextActive: { color: colors.primary },
  createBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: { ...typography.button, color: '#FFFFFF' },
  listCard: { marginBottom: spacing.xl, padding: spacing.lg },
  emptyText: { ...typography.bodySmall, textAlign: 'center', marginVertical: spacing.lg },
  announcementRow: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  announcementInfo: { flex: 1, minWidth: 0 },
  announcementTitle: { ...typography.body, fontWeight: '600' },
  announcementBody: { ...typography.bodySmall, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs, flexWrap: 'wrap' },
  audienceTag: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
  },
  audienceTagText: { ...typography.caption, fontWeight: '600' },
  metaText: { ...typography.caption, color: colors.textLight },
  announcementActions: { alignItems: 'flex-end', gap: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  switchLabel: { ...typography.caption, color: colors.textSecondary },
  deleteBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.error + '10',
  },
  deleteBtnText: { ...typography.caption, color: colors.error, fontWeight: '600' },
});
