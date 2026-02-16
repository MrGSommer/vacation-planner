import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  getOrCreateInviteLink,
  resetInviteLink,
  getCollaborators,
  removeCollaborator,
  updateCollaboratorRole,
  leaveTrip,
  transferOwnership,
  CollaboratorWithProfile,
} from '../../api/invitations';
import { deleteTrip } from '../../api/trips';
import { useToast } from '../../contexts/ToastContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { getDisplayName } from '../../utils/profileHelpers';
import { Button, Avatar } from '../../components/common';
import { TripPrintTab } from '../../components/trip/TripPrintTab';

interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  tripName: string;
  userId: string;
}

type Tab = 'share' | 'members' | 'print';

const roleLabels: Record<string, string> = {
  owner: 'Besitzer',
  editor: 'Bearbeiter',
  viewer: 'Betrachter',
};

export const ShareModal: React.FC<ShareModalProps> = ({
  visible,
  onClose,
  tripId,
  tripName,
  userId,
}) => {
  const { showToast } = useToast();
  const { canAddCollaborator } = useSubscription();
  const [tab, setTab] = useState<Tab>('share');
  const [type, setType] = useState<'info' | 'collaborate'>('collaborate');
  const [role, setRole] = useState<'editor' | 'viewer'>('viewer');
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<CollaboratorWithProfile[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Transfer ownership modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      loadMembers();
      loadExistingLink();
    }
  }, [visible]);

  // Auto-load existing link when type changes
  useEffect(() => {
    if (visible) {
      setGeneratedUrl(null);
      loadExistingLink();
    }
  }, [type]);

  const loadMembers = async () => {
    setMembersLoading(true);
    try {
      const data = await getCollaborators(tripId);
      setMembers(data);
    } catch {
      // ignore
    } finally {
      setMembersLoading(false);
    }
  };

  const loadExistingLink = async () => {
    setLoading(true);
    try {
      const { url } = await getOrCreateInviteLink(tripId, userId, type, role);
      setGeneratedUrl(url);
    } catch {
      // No existing link yet, that's fine
      setGeneratedUrl(null);
    } finally {
      setLoading(false);
    }
  };

  const handleResetLink = async () => {
    const doReset = async () => {
      setLoading(true);
      try {
        const { url } = await resetInviteLink(tripId, userId, type, role);
        setGeneratedUrl(url);
        showToast('Link zurückgesetzt', 'success');
      } catch {
        showToast('Fehler beim Zurücksetzen', 'error');
      } finally {
        setLoading(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Link zurücksetzen? Der alte Link funktioniert dann nicht mehr.')) {
        doReset();
      }
    } else {
      Alert.alert(
        'Link zurücksetzen',
        'Der alte Link funktioniert dann nicht mehr. Fortfahren?',
        [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Zurücksetzen', style: 'destructive', onPress: doReset },
        ],
      );
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
    setTab('share');
    setShowTransferModal(false);
    setTransferTargetId(null);
    onClose();
  };

  const isOwner = members.find(m => m.role === 'owner')?.user_id === userId;

  const handleRemoveMember = (member: CollaboratorWithProfile) => {
    // Prevent removing the owner
    if (member.role === 'owner') return;
    const name = getDisplayName(member.profile);
    const doRemove = async () => {
      try {
        await removeCollaborator(member.id);
        setMembers(prev => prev.filter(m => m.id !== member.id));
        showToast(`${name} entfernt`, 'success');
      } catch {
        showToast('Fehler beim Entfernen', 'error');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`${name} wirklich aus der Reise entfernen?`)) {
        doRemove();
      }
    } else {
      Alert.alert(
        'Teilnehmer entfernen',
        `${name} wirklich aus der Reise entfernen?`,
        [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Entfernen', style: 'destructive', onPress: doRemove },
        ],
      );
    }
  };

  const handleToggleRole = async (member: CollaboratorWithProfile) => {
    // Can't change owner's role
    if (member.role === 'owner') return;
    const newRole = member.role === 'editor' ? 'viewer' : 'editor';
    try {
      await updateCollaboratorRole(member.id, newRole);
      setMembers(prev =>
        prev.map(m => (m.id === member.id ? { ...m, role: newRole } : m)),
      );
    } catch {
      showToast('Fehler beim Ändern der Rolle', 'error');
    }
  };

  const handleLeaveTrip = async () => {
    const doLeave = async () => {
      try {
        const result = await leaveTrip(tripId);
        if (result.success) {
          showToast('Du hast die Reise verlassen', 'success');
          handleClose();
        } else if (result.requires_transfer) {
          setShowTransferModal(true);
        } else if (result.requires_delete_or_keep) {
          handleOwnerLeaveNoCollabs();
        }
      } catch (e: any) {
        showToast(e.message || 'Fehler beim Verlassen', 'error');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Reise wirklich verlassen?')) {
        doLeave();
      }
    } else {
      Alert.alert(
        'Reise verlassen',
        'Möchtest du diese Reise wirklich verlassen?',
        [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Verlassen', style: 'destructive', onPress: doLeave },
        ],
      );
    }
  };

  const handleOwnerLeaveNoCollabs = () => {
    const doDelete = async () => {
      try {
        await deleteTrip(tripId);
        showToast('Reise gelöscht', 'success');
        handleClose();
      } catch {
        showToast('Fehler beim Löschen', 'error');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Du bist der einzige Teilnehmer. Möchtest du die Reise löschen?')) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Reise löschen?',
        'Du bist der einzige Teilnehmer. Möchtest du die Reise löschen?',
        [
          { text: 'Behalten', style: 'cancel' },
          { text: 'Löschen', style: 'destructive', onPress: doDelete },
        ],
      );
    }
  };

  const handleTransferOwnership = async () => {
    if (!transferTargetId) return;
    setTransferLoading(true);
    try {
      await transferOwnership(tripId, transferTargetId);
      showToast('Ownership übertragen. Du hast die Reise verlassen.', 'success');
      handleClose();
    } catch (e: any) {
      showToast(e.message || 'Fehler bei der Übertragung', 'error');
    } finally {
      setTransferLoading(false);
    }
  };

  const nonOwnerMembers = members.filter(m => m.role !== 'owner');
  const owner = members.find(m => m.role === 'owner');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose}>
        <TouchableOpacity style={styles.modal} activeOpacity={1}>
          <Text style={styles.title}>{tripName}</Text>

          {/* Tab switcher */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'share' && styles.tabActive]}
              onPress={() => setTab('share')}
            >
              <Text style={[styles.tabText, tab === 'share' && styles.tabTextActive]}>Teilen</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'members' && styles.tabActive]}
              onPress={() => setTab('members')}
            >
              <Text style={[styles.tabText, tab === 'members' && styles.tabTextActive]}>
                Teilnehmer{nonOwnerMembers.length > 0 ? ` (${nonOwnerMembers.length})` : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'print' && styles.tabActive]}
              onPress={() => setTab('print')}
            >
              <Text style={[styles.tabText, tab === 'print' && styles.tabTextActive]}>Drucken</Text>
            </TouchableOpacity>
          </View>

          {tab === 'share' && (
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

              {loading ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
              ) : generatedUrl ? (
                <>
                  <View style={styles.urlBox}>
                    <Text style={styles.urlText} numberOfLines={2}>{generatedUrl}</Text>
                  </View>
                  <Button title="Link kopieren" onPress={handleCopy} style={styles.actionBtn} />
                  <TouchableOpacity onPress={handleResetLink} style={styles.resetLink}>
                    <Text style={styles.resetLinkText}>Link zurücksetzen</Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </>
          )}

          {tab === 'members' && (
            <ScrollView style={styles.membersList} showsVerticalScrollIndicator={false}>
              {membersLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
              ) : (
                <>
                  {/* Owner */}
                  {owner && (
                    <View style={styles.memberRow}>
                      <Avatar
                        uri={owner.profile.avatar_url}
                        name={getDisplayName(owner.profile)}
                        size={36}
                      />
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName} numberOfLines={1}>
                          {getDisplayName(owner.profile)}
                          {owner.user_id === userId ? ' (Du)' : ''}
                        </Text>
                        <Text style={styles.memberRole}>{roleLabels.owner}</Text>
                      </View>
                    </View>
                  )}

                  {/* Other members */}
                  {nonOwnerMembers.map(member => {
                    const isSelf = member.user_id === userId;
                    return (
                      <View key={member.id} style={styles.memberRow}>
                        <Avatar
                          uri={member.profile.avatar_url}
                          name={getDisplayName(member.profile)}
                          size={36}
                        />
                        <View style={styles.memberInfo}>
                          <Text style={styles.memberName} numberOfLines={1}>
                            {getDisplayName(member.profile)}
                            {isSelf ? ' (Du)' : ''}
                          </Text>
                          {isOwner ? (
                            <TouchableOpacity onPress={() => handleToggleRole(member)}>
                              <Text style={styles.memberRoleTappable}>
                                {roleLabels[member.role] || member.role}  ↻
                              </Text>
                            </TouchableOpacity>
                          ) : (
                            <Text style={styles.memberRole}>
                              {roleLabels[member.role] || member.role}
                            </Text>
                          )}
                        </View>
                        {isOwner && !isSelf && (
                          <TouchableOpacity
                            onPress={() => handleRemoveMember(member)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={styles.removeMember}>✕</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}

                  {nonOwnerMembers.length === 0 && (
                    <Text style={styles.emptyMembers}>
                      Noch keine Teilnehmer. Erstelle einen Einladungslink im Tab "Teilen".
                    </Text>
                  )}

                  {/* Leave trip button for non-owners */}
                  {!isOwner && (
                    <TouchableOpacity style={styles.leaveBtn} onPress={handleLeaveTrip}>
                      <Text style={styles.leaveBtnText}>Reise verlassen</Text>
                    </TouchableOpacity>
                  )}

                  {/* Leave trip button for owners (transfers ownership) */}
                  {isOwner && nonOwnerMembers.length > 0 && (
                    <TouchableOpacity style={styles.leaveBtn} onPress={handleLeaveTrip}>
                      <Text style={styles.leaveBtnText}>Reise verlassen & Besitz übertragen</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </ScrollView>
          )}

          {tab === 'print' && (
            <TripPrintTab tripId={tripId} tripName={tripName} />
          )}

          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>Schliessen</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Transfer Ownership Modal */}
      {showTransferModal && (
        <Modal visible={showTransferModal} transparent animationType="fade">
          <TouchableOpacity
            style={styles.overlay}
            activeOpacity={1}
            onPress={() => setShowTransferModal(false)}
          >
            <TouchableOpacity style={styles.transferModal} activeOpacity={1}>
              <Text style={styles.transferTitle}>Neuen Besitzer wählen</Text>
              <Text style={styles.transferSubtitle}>
                Wer soll die Reise übernehmen?
              </Text>

              <ScrollView style={{ maxHeight: 200 }}>
                {nonOwnerMembers.map(member => (
                  <TouchableOpacity
                    key={member.id}
                    style={[
                      styles.transferOption,
                      transferTargetId === member.user_id && styles.transferOptionActive,
                    ]}
                    onPress={() => setTransferTargetId(member.user_id)}
                  >
                    <Avatar
                      uri={member.profile.avatar_url}
                      name={getDisplayName(member.profile)}
                      size={32}
                    />
                    <Text style={styles.transferOptionName}>
                      {getDisplayName(member.profile)}
                    </Text>
                    {transferTargetId === member.user_id && (
                      <Text style={styles.transferCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.transferButtons}>
                <Button
                  title="Abbrechen"
                  onPress={() => setShowTransferModal(false)}
                  variant="ghost"
                  style={styles.transferBtn}
                />
                <Button
                  title="Übertragen & Verlassen"
                  onPress={handleTransferOwnership}
                  loading={transferLoading}
                  disabled={!transferTargetId}
                  style={styles.transferBtn}
                />
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
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
    maxHeight: '80%',
    ...shadows.lg,
  },
  title: { ...typography.h2, marginBottom: spacing.md, textAlign: 'center' },
  tabRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  tabActive: { backgroundColor: colors.primary },
  tabText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF' },
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
  actionBtn: { marginTop: spacing.lg },
  urlBox: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  urlText: { ...typography.bodySmall, color: colors.textSecondary },
  resetLink: { alignItems: 'center', marginTop: spacing.sm },
  resetLinkText: { ...typography.caption, color: colors.error },
  membersList: { maxHeight: 300 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  memberInfo: { flex: 1, marginLeft: spacing.sm },
  memberName: { ...typography.body, fontWeight: '500' },
  memberRole: { ...typography.caption, color: colors.textLight },
  memberRoleTappable: { ...typography.caption, color: colors.primary },
  removeMember: { fontSize: 16, color: colors.error, padding: spacing.xs },
  emptyMembers: { ...typography.bodySmall, color: colors.textLight, textAlign: 'center', marginTop: spacing.lg },
  leaveBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  leaveBtnText: { ...typography.bodySmall, color: colors.error, fontWeight: '600' },
  closeBtn: { marginTop: spacing.md, alignItems: 'center' },
  closeText: { ...typography.body, color: colors.textSecondary },
  // Transfer modal
  transferModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '85%',
    maxWidth: 400,
    ...shadows.lg,
  },
  transferTitle: { ...typography.h3, marginBottom: spacing.xs },
  transferSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md },
  transferOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  transferOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  transferOptionName: { ...typography.body, flex: 1 },
  transferCheck: { fontSize: 16, color: colors.primary, fontWeight: '700' },
  transferButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  transferBtn: { flex: 1 },
});
