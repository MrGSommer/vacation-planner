import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import * as ExpoDocumentPicker from 'expo-document-picker';
import { getDocuments, uploadDocument, deleteDocument } from '../../api/documents';
import { ActivityDocument } from '../../types/database';
import { useRealtime, RealtimePayload } from '../../hooks/useRealtime';
import { useToast } from '../../contexts/ToastContext';
import { cacheDocument, uncacheDocument } from '../../utils/documentCache';
import { getDocumentMeta, DocumentRecord, SyncState } from '../../utils/documentStore';
import { retryDocument } from '../../utils/documentSync';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { Icon, IconName } from '../../utils/icons';
import { logError } from '../../services/errorLogger';
import { DocumentViewer } from './DocumentViewer';

interface Props {
  activityId: string;
  tripId: string;
  userId: string;
  readOnly?: boolean;
}

const FILE_ICONS: Record<string, IconName> = {
  'application/pdf': 'document-text-outline',
  'image/jpeg': 'image-outline',
  'image/png': 'image-outline',
  'image/webp': 'image-outline',
  default: 'attach-outline',
};

const getFileIcon = (type: string) => FILE_ICONS[type] || FILE_ICONS.default;

const formatFileSize = (bytes: number | null) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

function relativeTime(ms: number | null): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'gerade';
  const m = Math.floor(s / 60);
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  return `vor ${d} Tag${d === 1 ? '' : 'en'}`;
}

interface SyncBadgeInfo {
  icon: IconName;
  color: string;
  label: string;
}

function syncBadge(state: SyncState | undefined, syncedAt: number | null): SyncBadgeInfo | null {
  switch (state) {
    case 'synced':
      return { icon: 'checkmark-circle', color: colors.success, label: syncedAt ? relativeTime(syncedAt) : 'offline verfügbar' };
    case 'syncing':
      return { icon: 'sync-outline', color: colors.primary, label: 'lädt …' };
    case 'pending':
      return { icon: 'cloud-download-outline', color: colors.textLight, label: 'wartet' };
    case 'stale':
      return { icon: 'refresh-outline', color: colors.warning, label: 'Update verfügbar' };
    case 'failed':
      return { icon: 'warning-outline', color: colors.error, label: 'Fehler – tippen zum erneut versuchen' };
    default:
      return null;
  }
}

export const DocumentPicker: React.FC<Props> = ({ activityId, tripId, userId, readOnly = false }) => {
  const { showToast } = useToast();
  const [documents, setDocuments] = useState<ActivityDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<ActivityDocument | null>(null);
  const [syncStates, setSyncStates] = useState<Record<string, DocumentRecord>>({});

  const refreshSyncStates = useCallback(async (docs: ActivityDocument[]) => {
    if (Platform.OS !== 'web') return;
    const next: Record<string, DocumentRecord> = {};
    for (const d of docs) {
      const meta = await getDocumentMeta(d.id);
      if (meta) next[d.id] = meta;
    }
    setSyncStates(next);
  }, []);

  const loadDocuments = useCallback(async () => {
    try {
      const docs = await getDocuments(activityId);
      setDocuments(docs);
      // Register + cache (idempotent; safe to call repeatedly)
      if (Platform.OS === 'web') {
        for (const d of docs) {
          cacheDocument(d).catch(() => {});
        }
        refreshSyncStates(docs);
      }
    } catch (e) {
      logError(e, { component: 'DocumentPicker', context: { action: 'loadDocuments' } });
    } finally {
      setLoading(false);
    }
  }, [activityId, refreshSyncStates]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  // Poll sync states while any doc is mid-flight
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const anyInFlight = Object.values(syncStates).some(s => s.sync_state === 'syncing' || s.sync_state === 'pending');
    if (!anyInFlight) return;
    const timer = setInterval(() => refreshSyncStates(documents), 1500);
    return () => clearInterval(timer);
  }, [syncStates, documents, refreshSyncStates]);

  // Live updates from other users
  const handleRealtime = useCallback((payload?: RealtimePayload) => {
    if (!payload) return;
    if (payload.eventType === 'INSERT' && payload.new) {
      const doc = payload.new as ActivityDocument;
      if (doc.activity_id === activityId) {
        setDocuments(prev => {
          if (prev.some(d => d.id === doc.id)) return prev;
          const next = [doc, ...prev];
          if (Platform.OS === 'web') {
            cacheDocument(doc).catch(() => {});
            refreshSyncStates(next);
          }
          return next;
        });
      }
    } else if (payload.eventType === 'DELETE' && payload.old) {
      const old = payload.old as { id: string };
      setDocuments(prev => prev.filter(d => d.id !== old.id));
    }
  }, [activityId, refreshSyncStates]);

  useRealtime('activity_documents', `activity_id=eq.${activityId}`, handleRealtime);

  const handlePick = async () => {
    try {
      const result = await ExpoDocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (result.canceled || !result.assets?.length) return;

      setUploading(true);
      const uploaded: ActivityDocument[] = [];
      let failed = 0;

      for (const file of result.assets) {
        try {
          const doc = await uploadDocument(
            activityId,
            tripId,
            userId,
            file.uri,
            file.name,
            file.mimeType || 'application/octet-stream',
            file.size,
          );
          uploaded.push(doc);
        } catch (e) {
          logError(e, { component: 'DocumentPicker', context: { action: 'uploadDocument' } });
          failed++;
        }
      }

      if (uploaded.length > 0) {
        if (Platform.OS === 'web') {
          uploaded.forEach(d => cacheDocument(d).catch(() => {}));
        }
        setDocuments(prev => {
          const existingIds = new Set(prev.map(d => d.id));
          const newDocs = uploaded.filter(d => !existingIds.has(d.id));
          const next = [...newDocs, ...prev];
          if (Platform.OS === 'web') refreshSyncStates(next);
          return next;
        });
        const msg = uploaded.length === 1
          ? 'Dokument hochgeladen'
          : `${uploaded.length} Dokumente hochgeladen`;
        showToast(failed > 0 ? `${msg} (${failed} fehlgeschlagen)` : msg, failed > 0 ? 'warning' : 'success');
      } else {
        showToast('Upload fehlgeschlagen', 'error');
      }
    } catch (e) {
      logError(e, { component: 'DocumentPicker', context: { action: 'handlePick' } });
      showToast('Upload fehlgeschlagen', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: ActivityDocument) => {
    const doDelete = async () => {
      try {
        await deleteDocument(doc);
        uncacheDocument(doc.id).catch(() => {});
        setDocuments(prev => prev.filter(d => d.id !== doc.id));
        setSyncStates(prev => {
          const next = { ...prev };
          delete next[doc.id];
          return next;
        });
        showToast('Dokument gelöscht', 'success');
      } catch (e) {
        logError(e, { component: 'DocumentPicker', context: { action: 'doDelete' } });
        showToast('Löschen fehlgeschlagen', 'error');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`"${doc.file_name}" löschen?`)) doDelete();
    } else {
      const { Alert } = require('react-native');
      Alert.alert('Löschen', `"${doc.file_name}" löschen?`, [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Löschen', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleOpen = (doc: ActivityDocument) => {
    if (Platform.OS === 'web') {
      setViewerDoc(doc);
    } else {
      const { Linking } = require('react-native');
      Linking.openURL(doc.url);
    }
  };

  const handleBadgeTap = async (doc: ActivityDocument, state: SyncState | undefined) => {
    if (state !== 'failed' || Platform.OS !== 'web') return;
    showToast('Erneuter Versuch …', 'info');
    const ok = await retryDocument(doc.id).catch(() => false);
    showToast(ok ? 'Dokument aktualisiert' : 'Sync fehlgeschlagen', ok ? 'success' : 'error');
    refreshSyncStates(documents);
  };

  if (loading) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Dokumente</Text>

      {documents.map(doc => {
        const state = syncStates[doc.id];
        const badge = syncBadge(state?.sync_state, state?.synced_at ?? null);
        return (
          <TouchableOpacity key={doc.id} style={styles.docRow} onPress={() => handleOpen(doc)} activeOpacity={0.7}>
            <View style={styles.docIconWrap}>
              <Icon name={getFileIcon(doc.file_type)} size={18} color={colors.primary} />
            </View>
            <View style={styles.docInfo}>
              <Text style={styles.docName} numberOfLines={1}>{doc.file_name}</Text>
              <View style={styles.docMetaRow}>
                {doc.file_size ? <Text style={styles.docSize}>{formatFileSize(doc.file_size)}</Text> : null}
                {badge && (
                  <TouchableOpacity
                    onPress={(e: any) => { e.stopPropagation(); handleBadgeTap(doc, state?.sync_state); }}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    style={styles.badge}
                    activeOpacity={state?.sync_state === 'failed' ? 0.5 : 1}
                  >
                    <Icon name={badge.icon} size={12} color={badge.color} />
                    <Text style={[styles.badgeText, { color: badge.color }]} numberOfLines={1}>{badge.label}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            {!readOnly && (
              <TouchableOpacity onPress={(e: any) => { e.stopPropagation(); handleDelete(doc); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="close-circle" size={16} color={colors.error} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        );
      })}

      {!readOnly && (
        <TouchableOpacity style={styles.uploadBtn} onPress={handlePick} disabled={uploading} activeOpacity={0.7}>
          {uploading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <Icon name="cloud-upload-outline" size={18} color={colors.primary} />
              <Text style={styles.uploadText}>Dokumente hinzufügen</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {documents.length === 0 && readOnly && (
        <Text style={styles.emptyText}>Keine Dokumente</Text>
      )}

      <DocumentViewer doc={viewerDoc} onClose={() => setViewerDoc(null)} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginTop: spacing.md },
  sectionLabel: { ...typography.bodySmall, fontWeight: '700', color: colors.primary, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  docIconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primary + '12', alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  docInfo: { flex: 1 },
  docName: { ...typography.bodySmall, fontWeight: '500' },
  docMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  docSize: { ...typography.caption, color: colors.textLight },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeText: { ...typography.caption, fontSize: 11 },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    borderStyle: 'dashed',
    gap: spacing.xs,
  },
  uploadText: { ...typography.bodySmall, color: colors.textSecondary },
  emptyText: { ...typography.bodySmall, color: colors.textLight, textAlign: 'center', paddingVertical: spacing.sm },
});
