import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Switch, Image, Platform } from 'react-native';
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
import { supabase } from '../../api/supabase';
import { searchPhotos, triggerDownload, UnsplashPhoto } from '../../api/unsplash';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { Icon } from '../../utils/icons';
import { Announcement } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { logError } from '../../services/errorLogger';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'AdminAnnouncements'> };

const ICON_OPTIONS: { value: string; icon: string; label: string }[] = [
  { value: 'icon:megaphone', icon: 'megaphone', label: 'Megafon' },
  { value: 'icon:sparkles', icon: 'sparkles', label: 'Neu' },
  { value: 'icon:gift', icon: 'gift', label: 'Geschenk' },
  { value: 'icon:rocket', icon: 'rocket', label: 'Rakete' },
  { value: 'icon:heart', icon: 'heart', label: 'Herz' },
  { value: 'icon:star', icon: 'star', label: 'Stern' },
  { value: 'icon:trophy', icon: 'trophy', label: 'Pokal' },
  { value: 'icon:alert-circle', icon: 'alert-circle', label: 'Info' },
];

const CTA_URL_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Kein Button' },
  { value: '/subscription', label: 'Premium-Abo' },
  { value: '/profile', label: 'Profil' },
  { value: '/feedback', label: 'Feedback' },
  { value: '/trip/{latestTrip}', label: 'Aktueller Trip' },
  { value: '/trip/{latestTrip}/budget', label: 'Trip → Budget' },
  { value: '/trip/{latestTrip}/packing', label: 'Trip → Packliste' },
  { value: '/trip/{latestTrip}/itinerary', label: 'Trip → Programm' },
  { value: '/trip/{latestTrip}/photos', label: 'Trip → Fotos' },
  { value: '/trip/{latestTrip}/stops', label: 'Trip → Stopps' },
  { value: '/trip/{latestTrip}/map', label: 'Trip → Karte' },
];

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
  const [enhancing, setEnhancing] = useState(false);
  const [unsplashPhotos, setUnsplashPhotos] = useState<UnsplashPhoto[]>([]);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showUrlPicker, setShowUrlPicker] = useState(false);

  const handleEnhance = async () => {
    if (!title.trim() && !body.trim()) return;
    setEnhancing(true);
    try {
      const { data, error } = await supabase.functions.invoke('enhance-announcement', {
        body: {
          messages: [{ role: 'user', content: `Verbessere diese Ankündigung:\n\nTitel: ${title || '(leer)'}\nNachricht: ${body || '(leer)'}\nButton-Text: ${ctaText || '(leer)'}\nButton-URL: ${ctaUrl || '(leer)'}` }],
          context: { audience },
        },
      });

      if (error) throw new Error(error.message || 'Enhance fehlgeschlagen');
      if (data?.error) throw new Error(data.error);

      const raw = data.content.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
      const json = JSON.parse(raw);
      if (json.title) setTitle(json.title);
      if (json.body) setBody(json.body);
      if (json.cta_text) setCtaText(json.cta_text);
      if (json.cta_url) setCtaUrl(json.cta_url);

      if (json.image_search) {
        const photos = await searchPhotos(json.image_search, 6);
        if (photos.length > 0) {
          setUnsplashPhotos(photos);
          setShowImagePicker(true);
        }
      }
    } catch (e) {
      logError(e, { component: 'AdminAnnouncementsScreen', context: { action: 'handleEnhance' } });
      console.error('Enhance error:', e);
    } finally {
      setEnhancing(false);
    }
  };

  const handleSelectPhoto = async (photo: UnsplashPhoto) => {
    setImageUrl(photo.urls.regular);
    setShowImagePicker(false);
    setUnsplashPhotos([]);
    await triggerDownload(photo).catch(() => {});
  };

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
      logError(e, { component: 'AdminAnnouncementsScreen', context: { action: 'loadAnnouncements' } });
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
      logError(e, { component: 'AdminAnnouncementsScreen', context: { action: 'handleCreate' } });
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
      logError(e, { component: 'AdminAnnouncementsScreen', context: { action: 'handleToggleActive' } });
      console.error('Toggle error:', e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adminDeleteAnnouncement(id);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      logError(e, { component: 'AdminAnnouncementsScreen', context: { action: 'handleDelete' } });
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
          <TouchableOpacity onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('AdminDashboard')} style={styles.backBtn}>
            <Text style={styles.backText}>{'<'} Zurück</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Ankündigungen</Text>
        </View>

        {/* Create Form */}
        <Card style={styles.formCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Neue Ankündigung</Text>
            <TouchableOpacity
              style={[styles.enhanceBtn, enhancing && { opacity: 0.6 }]}
              onPress={handleEnhance}
              disabled={enhancing || (!title.trim() && !body.trim())}
            >
              {enhancing ? (
                <ActivityIndicator color={colors.accent} size="small" />
              ) : (
                <>
                  <Icon name="sparkles" size={16} color={colors.accent} />
                  <Text style={styles.enhanceBtnText}>Fable</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

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

          <View style={styles.imageTypeRow}>
            <Text style={[styles.label, { marginBottom: 0 }]}>Bild / Icon (optional)</Text>
            <TouchableOpacity
              style={[styles.imageTypeBtn, !imageUrl.startsWith('icon:') && styles.imageTypeBtnActive]}
              onPress={() => { if (imageUrl.startsWith('icon:')) setImageUrl(''); }}
            >
              <Icon name="image-outline" size={14} color={!imageUrl.startsWith('icon:') ? colors.primary : colors.textSecondary} />
              <Text style={[styles.imageTypeBtnText, !imageUrl.startsWith('icon:') && { color: colors.primary }]}>Bild</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.imageTypeBtn, imageUrl.startsWith('icon:') && styles.imageTypeBtnActive]}
              onPress={() => { if (!imageUrl.startsWith('icon:')) setImageUrl('icon:megaphone'); }}
            >
              <Icon name="shapes-outline" size={14} color={imageUrl.startsWith('icon:') ? colors.primary : colors.textSecondary} />
              <Text style={[styles.imageTypeBtnText, imageUrl.startsWith('icon:') && { color: colors.primary }]}>Icon</Text>
            </TouchableOpacity>
          </View>

          {imageUrl.startsWith('icon:') ? (
            <View style={styles.iconPickerGrid}>
              {ICON_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.iconPickerItem, imageUrl === opt.value && styles.iconPickerItemActive]}
                  onPress={() => setImageUrl(opt.value)}
                >
                  <Icon name={opt.icon as any} size={24} color={imageUrl === opt.value ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.iconPickerLabel, imageUrl === opt.value && { color: colors.primary }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={imageUrl}
                onChangeText={setImageUrl}
                placeholder="https://..."
                placeholderTextColor={colors.textLight}
                autoCapitalize="none"
              />

              {/* Unsplash Image Picker */}
              {showImagePicker && unsplashPhotos.length > 0 && (
                <View style={styles.imagePickerBox}>
                  <View style={styles.imagePickerHeader}>
                    <Text style={styles.imagePickerTitle}>Bild wählen</Text>
                    <TouchableOpacity onPress={() => { setShowImagePicker(false); setUnsplashPhotos([]); }}>
                      <Icon name="close" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagePickerScroll}>
                    {unsplashPhotos.map((photo) => (
                      <TouchableOpacity key={photo.id} onPress={() => handleSelectPhoto(photo)} style={styles.imagePickerItem}>
                        <Image source={{ uri: photo.urls.small }} style={styles.imagePickerThumb} />
                        <Text style={styles.imagePickerCredit} numberOfLines={1}>{photo.user.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {imageUrl && !imageUrl.startsWith('icon:') ? (
                <Image source={{ uri: imageUrl }} style={styles.imagePreview} resizeMode="cover" />
              ) : null}
            </>
          )}

          <View style={[styles.row, { zIndex: 10 }]}>
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
            <View style={[styles.halfField, { zIndex: 10 }]}>
              <Text style={styles.label}>Button-URL</Text>
              <TouchableOpacity
                style={styles.dropdownBtn}
                onPress={() => setShowUrlPicker(!showUrlPicker)}
              >
                <Text style={[styles.dropdownBtnText, !ctaUrl && { color: colors.textLight }]} numberOfLines={1}>
                  {CTA_URL_OPTIONS.find(o => o.value === ctaUrl)?.label || ctaUrl || 'Route wählen...'}
                </Text>
                <Icon name={showUrlPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              {showUrlPicker && (
                <ScrollView style={styles.dropdownList} nestedScrollEnabled>
                  {CTA_URL_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.dropdownItem, ctaUrl === opt.value && styles.dropdownItemActive]}
                      onPress={() => { setCtaUrl(opt.value); setShowUrlPicker(false); }}
                    >
                      <Text style={[styles.dropdownItemText, ctaUrl === opt.value && { color: colors.primary, fontWeight: '600' }]}>
                        {opt.label}
                      </Text>
                      <Text style={styles.dropdownItemPath} numberOfLines={1}>{opt.value || '—'}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
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
                {a.image_url?.startsWith('icon:') && (
                  <View style={styles.announcementIcon}>
                    <Icon name={(a.image_url.slice(5) || 'megaphone') as any} size={20} color={colors.accent} />
                  </View>
                )}
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
  formCard: { marginBottom: spacing.xl, padding: spacing.lg, overflow: 'visible' as any, zIndex: 10 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { ...typography.h3 },
  enhanceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent + '12',
    borderWidth: 1,
    borderColor: colors.accent + '30',
  },
  enhanceBtnText: { ...typography.caption, fontWeight: '700' as any, color: colors.accent },
  imagePickerBox: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  imagePickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  imagePickerTitle: { ...typography.bodySmall, fontWeight: '600' as any },
  imagePickerScroll: { flexDirection: 'row' },
  imagePickerItem: { marginRight: spacing.sm, alignItems: 'center', width: 120 },
  imagePickerThumb: { width: 120, height: 72, borderRadius: borderRadius.sm },
  imagePickerCredit: { ...typography.caption, fontSize: 9, color: colors.textLight, marginTop: 2 },
  imageTypeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  imageTypeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  imageTypeBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  imageTypeBtnText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  iconPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  iconPickerItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  iconPickerItemActive: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  iconPickerLabel: { ...typography.caption, fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: colors.background,
  },
  dropdownBtnText: { ...typography.body, flex: 1 },
  dropdownList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    maxHeight: 240,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.card,
    zIndex: 9999,
    elevation: 20,
    ...(Platform.OS === 'web' ? { boxShadow: '0px 4px 8px rgba(0,0,0,0.15)' } : { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8 }),
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dropdownItemActive: { backgroundColor: colors.primary + '08' },
  dropdownItemText: { ...typography.bodySmall, color: colors.text },
  dropdownItemPath: { ...typography.caption, fontSize: 10, color: colors.textLight, maxWidth: 130 },
  imagePreview: { width: '100%', height: 120, borderRadius: borderRadius.md, marginBottom: spacing.md },
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
  listCard: { marginBottom: spacing.xl, padding: spacing.lg, zIndex: 1 },
  emptyText: { ...typography.bodySmall, textAlign: 'center', marginVertical: spacing.lg },
  announcementRow: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  announcementIcon: {
    width: 36, height: 36, borderRadius: borderRadius.sm,
    backgroundColor: colors.accent + '12', alignItems: 'center', justifyContent: 'center',
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
