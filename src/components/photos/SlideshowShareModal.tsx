import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator,
  Platform, Share as RNShare,
} from 'react-native';
import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import { Icon } from '../../utils/icons';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { MUSIC_TRACKS, MusicTrack } from '../../config/music';
import { createSlideshowShare } from '../../api/slideshows';
import { requireOnline } from '../../utils/offlineGate';
import { logError } from '../../services/errorLogger';

interface Props {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  tripName: string;
  photoIds: string[];
  /** 'settings' = just music+speed, 'share' = settings + create link */
  mode?: 'settings' | 'share';
  /** Current values (for settings mode) */
  initialTrack?: MusicTrack;
  initialInterval?: number;
  /** Called when user applies settings (settings mode) */
  onApply?: (track: MusicTrack, intervalMs: number) => void;
}

const SPEEDS = [
  { label: '3s', value: 3000 },
  { label: '4s', value: 4000 },
  { label: '6s', value: 6000 },
];

export const SlideshowShareModal: React.FC<Props> = ({
  visible, onClose, tripId, tripName, photoIds,
  mode = 'share', initialTrack, initialInterval, onApply,
}) => {
  const [selectedTrack, setSelectedTrack] = useState<MusicTrack>(initialTrack || 'relaxed');
  const [intervalMs, setIntervalMs] = useState(initialInterval || 4000);
  const [creating, setCreating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [previewingTrack, setPreviewingTrack] = useState<MusicTrack | null>(null);
  const soundRef = useRef<AudioPlayer | null>(null);

  // Sync initial values when modal opens
  useEffect(() => {
    if (visible) {
      if (initialTrack) setSelectedTrack(initialTrack);
      if (initialInterval) setIntervalMs(initialInterval);
    }
  }, [visible, initialTrack, initialInterval]);

  const stopPreview = useCallback(() => {
    if (soundRef.current) {
      try { soundRef.current.remove(); } catch {}
      soundRef.current = null;
    }
    setPreviewingTrack(null);
  }, []);

  const togglePreview = useCallback((track: MusicTrack) => {
    stopPreview();
    if (previewingTrack === track) return;

    const info = MUSIC_TRACKS.find(t => t.id === track);
    if (!info) return;
    try {
      const player = createAudioPlayer(info.url);
      player.volume = 0.5;
      player.play();
      soundRef.current = player;
      setPreviewingTrack(track);
      setTimeout(() => stopPreview(), 8000);
    } catch (e) {
      logError(e, { component: 'SlideshowShareModal', context: { action: 'info' } });
    }
  }, [previewingTrack, stopPreview]);

  const handleCreate = async () => {
    if (!requireOnline('Slideshow-Erstellung')) return;
    setCreating(true);
    try {
      const share = await createSlideshowShare({
        tripId,
        musicTrack: selectedTrack,
        intervalMs,
        photoIds,
        tripName,
      });
      setShareUrl(`https://wayfable.ch/slideshow/${share.token}`);
    } catch (_e) {
      logError(_e, { component: 'SlideshowShareModal', context: { action: 'handleCreate' } });
      if (Platform.OS === 'web') {
        window.alert('Link konnte nicht erstellt werden');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    if (Platform.OS === 'web' && navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!shareUrl) return;
    if (Platform.OS === 'web' && navigator.share) {
      await navigator.share({ title: `${tripName} — Diashow`, url: shareUrl });
    } else {
      await RNShare.share({ message: shareUrl, title: `${tripName} — Diashow` });
    }
  };

  const handleApply = () => {
    stopPreview();
    onApply?.(selectedTrack, intervalMs);
    onClose();
  };

  const handleClose = () => {
    stopPreview();
    setShareUrl(null);
    setCopied(false);
    onClose();
  };

  const isSettings = mode === 'settings';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>{isSettings ? 'Diashow-Einstellungen' : 'Diashow teilen'}</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {!shareUrl ? (
            <>
              {/* Music selection */}
              <Text style={styles.sectionTitle}>Musik</Text>
              <View style={styles.trackGrid}>
                {MUSIC_TRACKS.map(track => (
                  <TouchableOpacity
                    key={track.id}
                    style={[styles.trackCard, selectedTrack === track.id && styles.trackCardActive]}
                    onPress={() => { setSelectedTrack(track.id); togglePreview(track.id); }}
                    activeOpacity={0.7}
                  >
                    <Icon
                      name={track.icon as any}
                      size={24}
                      color={selectedTrack === track.id ? colors.primary : colors.textSecondary}
                    />
                    <Text style={[styles.trackLabel, selectedTrack === track.id && styles.trackLabelActive]}>
                      {track.label}
                    </Text>
                    <Text style={styles.trackDesc}>{track.description}</Text>
                    {previewingTrack === track.id && (
                      <View style={styles.playingIndicator}>
                        <Icon name="volume-high-outline" size={14} color={colors.primary} />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Speed selection */}
              <Text style={styles.sectionTitle}>Anzeigedauer</Text>
              <View style={styles.speedRow}>
                {SPEEDS.map(s => (
                  <TouchableOpacity
                    key={s.value}
                    style={[styles.speedBtn, intervalMs === s.value && styles.speedBtnActive]}
                    onPress={() => setIntervalMs(s.value)}
                  >
                    <Text style={[styles.speedText, intervalMs === s.value && styles.speedTextActive]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {isSettings ? (
                /* Settings mode: apply button */
                <TouchableOpacity style={styles.createBtn} onPress={handleApply}>
                  <Text style={styles.createBtnText}>Übernehmen</Text>
                </TouchableOpacity>
              ) : (
                <>
                  {/* Share mode: info + create link */}
                  <Text style={styles.infoText}>
                    {photoIds.length} Fotos · Link 30 Tage gültig
                  </Text>
                  <TouchableOpacity style={styles.createBtn} onPress={handleCreate} disabled={creating}>
                    {creating ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.createBtnText}>Link erstellen</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </>
          ) : (
            <>
              <View style={styles.successIcon}>
                <Icon name="checkmark-circle" size={48} color={colors.success} />
              </View>
              <Text style={styles.successText}>Diashow-Link erstellt!</Text>
              <View style={styles.linkBox}>
                <Text style={styles.linkText} numberOfLines={1}>{shareUrl}</Text>
              </View>
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={handleCopy}>
                  <Icon name={copied ? 'checkmark' : 'copy-outline'} size={20} color={colors.primary} />
                  <Text style={styles.actionBtnText}>{copied ? 'Kopiert!' : 'Kopieren'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={handleShare}>
                  <Icon name="share-outline" size={20} color="#fff" />
                  <Text style={[styles.actionBtnText, { color: '#fff' }]}>Teilen</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: colors.card, borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl, padding: spacing.lg,
    paddingBottom: Platform.OS === 'web' ? spacing.xl : 40,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.h3, fontWeight: '700' as const },
  sectionTitle: {
    ...typography.bodySmall, fontWeight: '600' as const, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  trackGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  trackCard: {
    width: '47%', padding: spacing.md, borderRadius: borderRadius.md,
    backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', gap: 4,
  },
  trackCardActive: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  trackLabel: { ...typography.bodySmall, fontWeight: '600' as const },
  trackLabelActive: { color: colors.primary },
  trackDesc: { ...typography.caption, color: colors.textSecondary },
  playingIndicator: { position: 'absolute', top: 6, right: 6 },
  speedRow: { flexDirection: 'row', gap: spacing.sm },
  speedBtn: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.md,
    backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center',
  },
  speedBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  speedText: { ...typography.body, fontWeight: '600' as const },
  speedTextActive: { color: colors.primary },
  infoText: {
    ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center',
    marginTop: spacing.lg,
  },
  createBtn: {
    backgroundColor: colors.primary, paddingVertical: spacing.md,
    borderRadius: borderRadius.md, alignItems: 'center', marginTop: spacing.md,
  },
  createBtnText: { ...typography.body, color: '#fff', fontWeight: '700' as const },
  successIcon: { alignItems: 'center', marginTop: spacing.lg },
  successText: {
    ...typography.h3, fontWeight: '700' as const, textAlign: 'center', marginTop: spacing.sm,
  },
  linkBox: {
    backgroundColor: colors.background, padding: spacing.md,
    borderRadius: borderRadius.md, marginTop: spacing.lg,
  },
  linkText: { ...typography.bodySmall, color: colors.text },
  actionRow: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, paddingVertical: spacing.md, borderRadius: borderRadius.md,
    backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border,
  },
  actionBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionBtnText: { ...typography.bodySmall, fontWeight: '600' as const },
});
