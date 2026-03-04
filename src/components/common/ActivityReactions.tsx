import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ActivityReaction } from '../../types/database';
import { getReactions, toggleReaction } from '../../api/comments';
import { useAuthContext } from '../../contexts/AuthContext';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

const EMOJIS = ['👍', '👎', '❤️', '🤔'] as const;

interface Props {
  activityId: string;
}

export const ActivityReactions: React.FC<Props> = ({ activityId }) => {
  const { user } = useAuthContext();
  const [reactions, setReactions] = useState<ActivityReaction[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await getReactions(activityId);
      setReactions(data);
    } catch {}
  }, [activityId]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (emoji: string) => {
    if (!user) return;
    // Optimistic update — one reaction per user
    const existing = reactions.find(r => r.user_id === user.id && r.emoji === emoji);
    if (existing) {
      // Toggle off
      setReactions(prev => prev.filter(r => r.id !== existing.id));
    } else {
      // Remove any other reaction by this user, then add new one
      setReactions(prev => [
        ...prev.filter(r => r.user_id !== user.id),
        { id: `temp-${Date.now()}`, activity_id: activityId, user_id: user.id, emoji, created_at: new Date().toISOString() },
      ]);
    }
    try {
      await toggleReaction(activityId, user.id, emoji);
      await load(); // Refresh from server
    } catch {
      await load(); // Revert on error
    }
  };

  // Group by emoji
  const grouped = EMOJIS.map(emoji => {
    const count = reactions.filter(r => r.emoji === emoji).length;
    const myReaction = reactions.some(r => r.emoji === emoji && r.user_id === user?.id);
    return { emoji, count, myReaction };
  });

  return (
    <View style={styles.container}>
      {grouped.map(({ emoji, count, myReaction }) => (
        <TouchableOpacity
          key={emoji}
          style={[styles.chip, myReaction && styles.chipActive]}
          onPress={() => handleToggle(emoji)}
          activeOpacity={0.7}
        >
          <Text style={styles.emoji}>{emoji}</Text>
          {count > 0 && <Text style={[styles.count, myReaction && styles.countActive]}>{count}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: { borderColor: colors.secondary, backgroundColor: colors.secondary + '15' },
  emoji: { fontSize: 16 },
  count: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  countActive: { color: colors.secondary },
});
