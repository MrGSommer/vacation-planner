import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, Platform } from 'react-native';
import * as ExpoDocumentPicker from 'expo-document-picker';
import { getDocuments, uploadDocument, deleteDocument } from '../../api/documents';
import { ActivityDocument } from '../../types/database';
import { useToast } from '../../contexts/ToastContext';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

interface Props {
  activityId: string;
  tripId: string;
  userId: string;
  readOnly?: boolean;
}

const FILE_ICONS: Record<string, string> = {
  'application/pdf': '📄',
  'image/jpeg': '🖼️',
  'image/png': '🖼️',
  'image/webp': '🖼️',
  default: '📎',
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

  useEffect(() => {
    loadDocuments();
  }, [activityId]);

  const loadDocuments = async () => {
    try {
      const docs = await getDocuments(activityId);
      setDocuments(docs);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handlePick = async () => {
    try {
      const result = await ExpoDocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      setUploading(true);

      const doc = await uploadDocument(
        activityId,
        tripId,
        userId,
        file.uri,
        file.name,
        file.mimeType || 'application/octet-stream',
        file.size,
      );
      setDocuments(prev => [doc, ...prev]);
      showToast('Dokument hochgeladen', 'success');
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
          <Text style={styles.docIcon}>{getFileIcon(doc.file_type)}</Text>
          <View style={styles.docInfo}>
            <Text style={styles.docName} numberOfLines={1}>{doc.file_name}</Text>
            {doc.file_size && <Text style={styles.docSize}>{formatFileSize(doc.file_size)}</Text>}
          </View>
          {!readOnly && (
            <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleDelete(doc); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.docDelete}>✕</Text>
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
              <Text style={styles.uploadIcon}>+</Text>
              <Text style={styles.uploadText}>Dokument hinzufugen</Text>
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
  docIcon: { fontSize: 20, marginRight: spacing.sm },
  docInfo: { flex: 1 },
  docName: { ...typography.bodySmall, fontWeight: '500' },
  docSize: { ...typography.caption, color: colors.textLight },
  docDelete: { fontSize: 14, color: colors.error, padding: spacing.xs },
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
  uploadIcon: { fontSize: 18, color: colors.primary, fontWeight: '300' },
  uploadText: { ...typography.bodySmall, color: colors.textSecondary },
  emptyText: { ...typography.bodySmall, color: colors.textLight, textAlign: 'center', paddingVertical: spacing.sm },
});
