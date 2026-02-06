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
  createInviteLink,
  getCollaborators,
  removeCollaborator,
  updateCollaboratorRole,
  CollaboratorWithProfile,
} from '../../api/invitations';
import { useToast } from '../../contexts/ToastContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { Button, Avatar } from '../../components/common';

interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  tripName: string;
  userId: string;
}

type Tab = 'share' | 'members';

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

  useEffect(() => {
    if (visible) {
      loadMembers();
    }
  }, [visible]);

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

  const handleCreate = async () => {
    if (type === 'collaborate' && !canAddCollaborator(nonOwnerMembers.length)) {
      showToast('Kollaborateur-Limit erreicht. Upgrade auf Premium für unbegrenzte Teilnehmer.', 'error');
      return;
    }
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
    setTab('share');
    onClose();
  };

  const handleRemoveMember = (member: CollaboratorWithProfile) => {
    const name = member.profile.full_name || member.profile.email;
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
          </View>

          {tab === 'share' && (
            <>
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
                    style={styles.actionBtn}
                  />
                </>
              ) : (
                <>
                  <View style={styles.urlBox}>
                    <Text style={styles.urlText} numberOfLines={2}>{generatedUrl}</Text>
                  </View>
                  <Button title="Link kopieren" onPress={handleCopy} style={styles.actionBtn} />
                </>
              )}
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
                        name={owner.profile.full_name || owner.profile.email}
                        size={36}
                      />
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName} numberOfLines={1}>
                          {owner.profile.full_name || owner.profile.email}
                        </Text>
                        <Text style={styles.memberRole}>{roleLabels.owner}</Text>
                      </View>
                    </View>
                  )}

                  {/* Other members */}
                  {nonOwnerMembers.map(member => (
                    <View key={member.id} style={styles.memberRow}>
                      <Avatar
                        uri={member.profile.avatar_url}
                        name={member.profile.full_name || member.profile.email}
                        size={36}
                      />
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName} numberOfLines={1}>
                          {member.profile.full_name || member.profile.email}
                        </Text>
                        <TouchableOpacity onPress={() => handleToggleRole(member)}>
                          <Text style={styles.memberRoleTappable}>
                            {roleLabels[member.role] || member.role}  ↻
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleRemoveMember(member)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.removeMember}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  {nonOwnerMembers.length === 0 && (
                    <Text style={styles.emptyMembers}>
                      Noch keine Teilnehmer. Erstelle einen Einladungslink im Tab "Teilen".
                    </Text>
                  )}
                </>
              )}
            </ScrollView>
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
  closeBtn: { marginTop: spacing.md, alignItems: 'center' },
  closeText: { ...typography.body, color: colors.textSecondary },
});
