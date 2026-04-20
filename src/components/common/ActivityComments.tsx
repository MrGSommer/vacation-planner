import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, Alert } from 'react-native';
import { ActivityComment } from '../../types/database';
import { getComments, addComment, deleteComment } from '../../api/comments';
import { useAuthContext } from '../../contexts/AuthContext';
import { getDisplayName } from '../../utils/profileHelpers';
import { Avatar } from './Avatar';
import { Icon } from '../../utils/icons';
import { colors, spacing, borderRadius, typography, iconSize } from '../../utils/theme';
import { logError } from '../../services/errorLogger';

interface Props {
  activityId: string;
}

export const ActivityComments: React.FC<Props> = ({ activityId }) => {
  const { user } = useAuthContext();
  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getComments(activityId);
      setComments(data);
    } catch (e) {
      logError(e, { component: 'ActivityComments', context: { action: 'load' } });
      /* silent - comments are non-critical */
    }
  }, [activityId]);

  useEffect(() => { load(); }, [load]);

  const handleSend = async () => {
    if (!text.trim() || !user || sending) return;
    setSending(true);
    try {
      const comment = await addComment(activityId, user.id, text.trim());
      setComments(prev => [...prev, comment]);
      setText('');
    } catch (e) {
      logError(e, { component: 'ActivityComments', context: { action: 'handleSend' } });
      Alert.alert('Fehler', 'Kommentar konnte nicht gespeichert werden.');
    }
    setSending(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteComment(id);
      setComments(prev => prev.filter(c => c.id !== id));
    } catch (e) {
      logError(e, { component: 'ActivityComments', context: { action: 'handleDelete' } });
      Alert.alert('Fehler', 'Kommentar konnte nicht gelöscht werden.');
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'gerade eben';
    if (mins < 60) return `vor ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `vor ${hours}h`;
    const days = Math.floor(hours / 24);
    return `vor ${days}d`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Kommentare {comments.length > 0 && `(${comments.length})`}
      </Text>

      {comments.map(comment => (
        <View key={comment.id} style={styles.commentRow}>
          <Avatar
            uri={comment.profile?.avatar_url || null}
            name={comment.profile ? getDisplayName(comment.profile as any) : '?'}
            size={28}
          />
          <View style={styles.commentBody}>
            <View style={styles.commentHeader}>
              <Text style={styles.commentAuthor}>
                {comment.profile ? getDisplayName(comment.profile as any) : 'Unbekannt'}
              </Text>
              <Text style={styles.commentTime}>{timeAgo(comment.created_at)}</Text>
            </View>
            <Text style={styles.commentText}>{comment.content}</Text>
          </View>
          {comment.user_id === user?.id && (
            <TouchableOpacity onPress={() => handleDelete(comment.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="close-outline" size={iconSize.xs} color={colors.error} />
            </TouchableOpacity>
          )}
        </View>
      ))}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Kommentar schreiben..."
          placeholderTextColor={colors.textLight}
          multiline
          maxLength={500}
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!text.trim() || sending}
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
        >
          <Icon name="send" size={iconSize.sm} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginTop: spacing.md },
  title: { ...typography.bodySmall, fontWeight: '600', marginBottom: spacing.sm, color: colors.text },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm, gap: spacing.sm },
  commentBody: { flex: 1 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  commentAuthor: { ...typography.caption, fontWeight: '600', color: colors.text },
  commentTime: { ...typography.caption, color: colors.textLight },
  commentText: { ...typography.bodySmall, color: colors.text, marginTop: 2 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
  input: {
    flex: 1,
    ...typography.bodySmall,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 80,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.secondary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
});
