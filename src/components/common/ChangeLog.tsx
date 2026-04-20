import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { ActivityLogEntry, getActivityLog } from '../../api/activityLog';
import { getDisplayName } from '../../utils/profileHelpers';
import { Avatar } from './Avatar';
import { Icon } from '../../utils/icons';
import { colors, spacing, borderRadius, typography, shadows, iconSize } from '../../utils/theme';
import { logError } from '../../services/errorLogger';

interface Props {
  tripId: string;
  visible: boolean;
  onClose: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  created: 'hat hinzugefügt',
  updated: 'hat geändert',
  deleted: 'hat gelöscht',
};

const ENTITY_LABELS: Record<string, string> = {
  activity: 'Aktivität',
  stop: 'Stop',
};

const ACTION_ICONS: Record<string, string> = {
  created: 'add-circle-outline',
  updated: 'create-outline',
  deleted: 'trash-outline',
};

const ACTION_COLORS: Record<string, string> = {
  created: colors.success,
  updated: colors.secondary,
  deleted: colors.error,
};

export const ChangeLog: React.FC<Props> = ({ tripId, visible, onClose }) => {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getActivityLog(tripId);
      setEntries(data);
    } catch (e) {
      logError(e, { component: 'ChangeLog', context: { action: 'load' } });
    }
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'gerade eben';
    if (mins < 60) return `vor ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `vor ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `vor ${days}d`;
    return new Date(dateStr).toLocaleDateString('de-CH', { day: '2-digit', month: 'short' });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Änderungsverlauf</Text>
            <TouchableOpacity onPress={onClose}>
              <Icon name="close" size={iconSize.md} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
          ) : entries.length === 0 ? (
            <Text style={styles.emptyText}>Noch keine Änderungen</Text>
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              {entries.map(entry => {
                const name = entry.profile ? getDisplayName(entry.profile as any) : 'Unbekannt';
                const actionLabel = ACTION_LABELS[entry.action] || entry.action;
                const entityLabel = ENTITY_LABELS[entry.entity_type] || entry.entity_type;
                const iconName = ACTION_ICONS[entry.action] || 'ellipse-outline';
                const iconColor = ACTION_COLORS[entry.action] || colors.textSecondary;
                const title = entry.details?.title || entry.details?.name || '';
                const oldTitle = entry.details?.old_title;

                return (
                  <View key={entry.id} style={styles.entry}>
                    <View style={[styles.iconDot, { backgroundColor: iconColor + '20' }]}>
                      <Icon name={iconName as any} size={14} color={iconColor} />
                    </View>
                    <View style={styles.entryBody}>
                      <Text style={styles.entryText}>
                        <Text style={styles.entryName}>{name}</Text>
                        {' '}{actionLabel}{' '}
                        <Text style={styles.entryEntity}>{entityLabel}</Text>
                        {title ? `: "${title}"` : ''}
                        {oldTitle ? ` (war: "${oldTitle}")` : ''}
                      </Text>
                      <Text style={styles.entryTime}>{timeAgo(entry.created_at)}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '70%',
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { ...typography.h3 },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', padding: spacing.xl },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg },
  entry: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md, gap: spacing.sm },
  iconDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  entryBody: { flex: 1 },
  entryText: { ...typography.bodySmall, color: colors.text, lineHeight: 20 },
  entryName: { fontWeight: '600' },
  entryEntity: { color: colors.secondary },
  entryTime: { ...typography.caption, color: colors.textLight, marginTop: 2 },
});
