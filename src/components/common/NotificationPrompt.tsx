import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { isPushSupported, getPushPermission, subscribeToPush } from '../../utils/pushManager';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

interface Props {
  userId: string;
}

export const NotificationPrompt: React.FC<Props> = ({ userId }) => {
  const [visible, setVisible] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;
    const permission = getPushPermission();
    // Show prompt only if user hasn't decided yet
    if (permission === 'default') {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const handleEnable = async () => {
    setSubscribing(true);
    const success = await subscribeToPush(userId);
    setSubscribing(false);
    if (success) {
      setVisible(false);
    } else {
      // Permission denied or error — hide prompt
      setVisible(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>🔔</Text>
        <View style={styles.textWrap}>
          <Text style={styles.title}>Benachrichtigungen aktivieren</Text>
          <Text style={styles.subtitle}>Erhalte Erinnerungen vor deinen Reisen</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => setVisible(false)} style={styles.dismissBtn}>
          <Text style={styles.dismissText}>Später</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleEnable}
          disabled={subscribing}
          style={styles.enableBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.enableText}>{subscribing ? '...' : 'Aktivieren'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.sky + '15',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  icon: { fontSize: 24 },
  textWrap: { flex: 1 },
  title: { ...typography.body, fontWeight: '600' },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  dismissBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  dismissText: { ...typography.bodySmall, color: colors.textLight },
  enableBtn: {
    backgroundColor: colors.sky,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
  },
  enableText: { ...typography.bodySmall, color: '#FFFFFF', fontWeight: '600' },
});
