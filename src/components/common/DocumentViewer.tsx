import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { ActivityDocument } from '../../types/database';
import { getDocumentBlob } from '../../utils/documentCache';
import { colors, spacing, typography, borderRadius } from '../../utils/theme';
import { Icon } from '../../utils/icons';

interface Props {
  doc: ActivityDocument | null;
  onClose: () => void;
}

/**
 * Full-screen modal that renders a cached document inline.
 *
 * Images (image/*)  → <img> tag with object-url
 * PDFs / other      → <iframe> with object-url, Download button as fallback
 * Online, not cached → attempts iframe on direct URL (fast path)
 *
 * Object URLs are revoked on close/unmount to free memory.
 */
export const DocumentViewer: React.FC<Props> = ({ doc, onClose }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let createdUrl: string | null = null;

    async function load() {
      if (!doc || Platform.OS !== 'web') return;
      setLoading(true);
      setError(null);
      setObjectUrl(null);

      try {
        const blob = await getDocumentBlob(doc.id);
        if (blob) {
          if (revoked) return;
          createdUrl = URL.createObjectURL(blob);
          setObjectUrl(createdUrl);
        } else if (navigator.onLine) {
          setObjectUrl(doc.url);
        } else {
          setError('Dokument offline nicht verfügbar.');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Fehler beim Laden');
      } finally {
        if (!revoked) setLoading(false);
      }
    }
    load();

    return () => {
      revoked = true;
      if (createdUrl && createdUrl.startsWith('blob:')) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [doc]);

  if (Platform.OS !== 'web' || !doc) return null;

  const isImage = doc.file_type.startsWith('image/');

  const handleDownload = () => {
    if (!objectUrl) return;
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = doc.file_name;
    a.click();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.filename} numberOfLines={1}>{doc.file_name}</Text>
            <View style={styles.actions}>
              {objectUrl && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={handleDownload}
                  accessibilityLabel="Download"
                >
                  <Icon name="download-outline" size={20} color={colors.text} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.actionBtn} onPress={onClose} accessibilityLabel="Schliessen">
                <Icon name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.content}>
            {loading && (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            )}

            {!loading && error && (
              <View style={styles.center}>
                <Icon name="alert-circle-outline" size={48} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {!loading && !error && objectUrl && (
              <ViewerFrame url={objectUrl} isImage={isImage} />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

/**
 * Renderer using imperative DOM manipulation (safer than innerHTML).
 * Creates <img> for images, <iframe> for PDFs/other. Re-creates on url change.
 */
const ViewerFrame: React.FC<{ url: string; isImage: boolean }> = ({ url, isImage }) => {
  const [node, setNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!node) return;
    // Safely clear all children (no innerHTML)
    while (node.firstChild) node.removeChild(node.firstChild);

    if (isImage) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;display:block;margin:auto;';
      node.appendChild(img);
    } else {
      // PDFs + everything else → iframe.
      // Some iOS Safari edge cases may fail to render PDFs in iframe → the
      // header's Download button remains available as fallback.
      const iframe = document.createElement('iframe');
      iframe.src = url;
      iframe.style.cssText = 'width:100%;height:100%;border:0;background:#fff;';
      node.appendChild(iframe);
    }

    return () => {
      if (node) while (node.firstChild) node.removeChild(node.firstChild);
    };
  }, [node, url, isImage]);

  return <View ref={setNode as any} style={styles.frame} />;
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.sm,
  },
  container: {
    width: '100%',
    maxWidth: 1000,
    height: '100%',
    maxHeight: 900,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  filename: {
    ...typography.body,
    flex: 1,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  frame: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
});
