import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PresenceUser } from '../../hooks/usePresence';
import { Avatar } from './Avatar';
import { colors, spacing, typography } from '../../utils/theme';

const SCREEN_LABELS: Record<string, string> = {
  TripDetail: 'Übersicht',
  Itinerary: 'Tagesplan',
  Budget: 'Budget',
  Packing: 'Packliste',
  Photos: 'Fotos',
  Stops: 'Stops',
  Map: 'Karte',
};

interface Props {
  users: PresenceUser[];
}

export const PresenceAvatars: React.FC<Props> = ({ users }) => {
  if (users.length === 0) return null;

  return (
    <View style={styles.container}>
      {users.map(u => (
        <View key={u.userId} style={styles.userChip}>
          <View style={styles.avatarWrap}>
            <Avatar uri={u.avatarUrl} name={u.name} size={22} />
            <View style={styles.onlineDot} />
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {u.name.split(' ')[0]}
            {SCREEN_LABELS[u.screen] ? ` · ${SCREEN_LABELS[u.screen]}` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  userChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.secondary + '15',
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderRadius: 12,
  },
  avatarWrap: { position: 'relative' },
  onlineDot: {
    position: 'absolute', bottom: -1, right: -1,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.success,
    borderWidth: 1.5, borderColor: colors.card,
  },
  name: { ...typography.caption, color: colors.secondary, fontWeight: '500', maxWidth: 120 },
});
