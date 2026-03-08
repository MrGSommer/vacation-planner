import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, Platform } from 'react-native';
import * as ExpoDocumentPicker from 'expo-document-picker';
import { getDocuments, uploadDocument, deleteDocument } from '../../api/documents';
import { ActivityDocument } from '../../types/database';
import { useRealtime, RealtimePayload } from '../../hooks/useRealtime';
import { useToast } from '../../contexts/ToastContext';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { Icon } from '../../utils/icons';

interface Props {
  activityId: string;
  tripId: string;
  userId: string;
  readOnly?: boolean;
}

const FILE_ICONS: Record<string, string> = {
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

export const DocumentPicker: React.FC<Props> = ({ activityId, tripId, userId, readOnly = false }) => {
  const { showToast } = useToast();
  const [documents, setDocuments] = useState<ActivityDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const loadDocuments = useCallback(async () => {
    try {
      const docs = await getDocuments(activityId);
      setDocuments(docs);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  // Live updates from other users
  const handleRealtime = useCallback((payload?: RealtimePayload) => {
    if (!payload) return;
    if (payload.eventType === 'INSERT' && payload.new) {
      const doc = payload.new as ActivityDocument;
      if (doc.activity_id === activityId) {
        setDocuments(prev => {
          if (prev.some(d => d.id === doc.id)) return prev;
          return [doc, ...prev];
        });
      }
    } else if (payload.eventType === 'DELETE' && payload.old) {
      const old = payload.old as { id: string };
      setDocuments(prev => prev.filter(d => d.id !== old.id));
    }
  }, [activityId]);

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
        } catch {
          failed++;
        }
      }

      if (uploaded.length > 0) {
        // Realtime will add them, but also add optimistically to avoid flicker
        setDocuments(prev => {
          const existingIds = new Set(prev.map(d => d.id));
          const newDocs = uploaded.filter(d => !existingIds.has(d.id));
          return [...newDocs, ...prev];
        });
        const msg = uploaded.length === 1
          ? 'Dokument hochgeladen'
          : `${uploaded.length} Dokumente hochgeladen`;
        showToast(failed > 0 ? `${msg} (${failed} fehlgeschlagen)` : msg, failed > 0 ? 'warning' : 'success');
      } else {
        showToast('Upload fehlgeschlagen', 'error');
      }
    } catch {
      showToast('Upload fehlgeschlagen', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: ActivityDocument) => {
    const doDelete = async () => {
      try {
        await deleteDocument(doc);
        setDocuments(prev => prev.filter(d => d.id !== doc.id));
        showToast('Dokument gelöscht', 'success');
      } catch {
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
    Linking.openURL(doc.url);
  };

  if (loading) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Dokumente</Text>

      {documents.map(doc => (
        <TouchableOpacity key={doc.id} style={styles.docRow} onPress={() => handleOpen(doc)} activeOpacity={0.7}>
          <View style={styles.docIconWrap}>
            <Icon name={getFileIcon(doc.file_type)} size={18} color={colors.primary} />
          </View>
          <View style={styles.docInfo}>
            <Text style={styles.docName} numberOfLines={1}>{doc.file_name}</Text>
            {doc.file_size ? <Text style={styles.docSize}>{formatFileSize(doc.file_size)}</Text> : null}
          </View>
          {!readOnly && (
            <TouchableOpacity onPress={(e: any) => { e.stopPropagation(); handleDelete(doc); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="close-circle" size={16} color={colors.error} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      ))}

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
  docSize: { ...typography.caption, color: colors.textLight },
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
