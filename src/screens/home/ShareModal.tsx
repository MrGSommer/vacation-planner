import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { createInviteLink } from '../../api/invitations';
import { useToast } from '../../contexts/ToastContext';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { Button } from '../../components/common';

interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  tripName: string;
  userId: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  visible,
  onClose,
  tripId,
  tripName,
  userId,
}) => {
  const { showToast } = useToast();
  const [type, setType] = useState<'info' | 'collaborate'>('collaborate');
  const [role, setRole] = useState<'editor' | 'viewer'>('viewer');
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const { url } = await createInviteLink(tripId, userId, type, role);
      setGeneratedUrl(url);
    } catch {
      showToast('Fehler beim Erstellen des Links', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedUrl) return;
    if (Platform.OS === 'web' && navigator.share) {
      try {
        await navigator.share({ title: tripName, url: generatedUrl });
        return;
      } catch {}
    }
    await Clipboard.setStringAsync(generatedUrl);
    showToast('Link kopiert!', 'success');
  };

  const handleClose = () => {
    setGeneratedUrl(null);
    setType('collaborate');
    setRole('viewer');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose}>
        <TouchableOpacity style={styles.modal} activeOpacity={1}>
          <Text style={styles.title}>{tripName} teilen</Text>

          {!generatedUrl ? (
            <>
              <Text style={styles.label}>Art des Links</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.toggleBtn, type === 'info' && styles.toggleActive]}
                  onPress={() => setType('info')}
                >
                  <Text style={[styles.toggleText, type === 'info' && styles.toggleTextActive]}>
                    Info teilen
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, type === 'collaborate' && styles.toggleActive]}
                  onPress={() => setType('collaborate')}
                >
                  <Text style={[styles.toggleText, type === 'collaborate' && styles.toggleTextActive]}>
                    Zusammenarbeit
                  </Text>
                </TouchableOpacity>
              </View>

              {type === 'collaborate' && (
                <>
                  <Text style={styles.label}>Rolle</Text>
                  <View style={styles.toggleRow}>
                    <TouchableOpacity
                      style={[styles.toggleBtn, role === 'viewer' && styles.toggleActive]}
                      onPress={() => setRole('viewer')}
                    >
                      <Text style={[styles.toggleText, role === 'viewer' && styles.toggleTextActive]}>
                        Betrachter
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.toggleBtn, role === 'editor' && styles.toggleActive]}
                      onPress={() => setRole('editor')}
                    >
                      <Text style={[styles.toggleText, role === 'editor' && styles.toggleTextActive]}>
                        Bearbeiter
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              <Button
                title="Link erstellen"
                onPress={handleCreate}
                loading={loading}
                style={styles.createBtn}
              />
            </>
          ) : (
            <>
              <View style={styles.urlBox}>
                <Text style={styles.urlText} numberOfLines={2}>{generatedUrl}</Text>
              </View>
              <Button title="Link kopieren" onPress={handleCopy} style={styles.createBtn} />
            </>
          )}

          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>Schliessen</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '85%',
    maxWidth: 400,
    ...shadows.lg,
  },
  title: { ...typography.h2, marginBottom: spacing.lg, textAlign: 'center' },
  label: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.md },
  toggleRow: { flexDirection: 'row', gap: spacing.sm },
  toggleBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  toggleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleText: { ...typography.bodySmall, color: colors.text },
  toggleTextActive: { color: '#FFFFFF', fontWeight: '600' },
  createBtn: { marginTop: spacing.lg },
  urlBox: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  urlText: { ...typography.bodySmall, color: colors.textSecondary },
  closeBtn: { marginTop: spacing.md, alignItems: 'center' },
  closeText: { ...typography.body, color: colors.textSecondary },
});
