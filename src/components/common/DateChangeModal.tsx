import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { Icon, IconName } from '../../utils/icons';

interface DateChangeModalProps {
  visible: boolean;
  onClose: () => void;
  affectedCount: number;
  totalActivities: number;
  daysRemoved: number;
  daysAdded: number;
  isShifted: boolean;
  loading: boolean;
  onShift: () => void;
  onDeleteAffected: () => void;
  onDeleteAll: () => void;
}

interface OptionCard {
  key: string;
  label: string;
  icon: IconName;
  description: string;
  onPress: () => void;
  destructive?: boolean;
}

export const DateChangeModal: React.FC<DateChangeModalProps> = ({
  visible,
  onClose,
  affectedCount,
  totalActivities,
  daysRemoved,
  daysAdded,
  isShifted,
  loading,
  onShift,
  onDeleteAffected,
  onDeleteAll,
}) => {
  const options: OptionCard[] = [
    {
      key: 'shift',
      label: 'Inhalte verschieben',
      icon: 'swap-horizontal-outline',
      description: isShifted
        ? 'Aktivitäten behalten ihre Tagesposition (Tag 1 → neuer Tag 1). Überschüssige Tage werden auf den letzten Tag verschoben.'
        : `Aktivitäten von den ${daysRemoved} entfernten Tag${daysRemoved === 1 ? '' : 'en'} werden auf den nächstgelegenen Tag verschoben.`,
      onPress: onShift,
    },
    {
      key: 'delete-affected',
      label: 'Betroffene löschen',
      icon: 'trash-outline',
      description: `${affectedCount} Aktivität${affectedCount === 1 ? '' : 'en'} auf entfernten Tagen löschen. Restliche ${totalActivities - affectedCount} Aktivität${totalActivities - affectedCount === 1 ? '' : 'en'} bleiben erhalten.`,
      onPress: onDeleteAffected,
      destructive: true,
    },
    {
      key: 'delete-all',
      label: 'Alles neu starten',
      icon: 'refresh-outline',
      description: `Alle ${totalActivities} Aktivitäten löschen und mit einem leeren Plan starten.`,
      onPress: onDeleteAll,
      destructive: true,
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={loading ? undefined : onClose}>
        <TouchableOpacity style={styles.modal} activeOpacity={1} onPress={() => {}}>
          <Text style={styles.title}>Datumsänderung</Text>
          <Text style={styles.subtitle}>
            {daysRemoved > 0 && daysAdded > 0
              ? `${daysRemoved} Tag${daysRemoved === 1 ? ' wird' : 'e werden'} entfernt und ${daysAdded} neu hinzugefügt. ${affectedCount} Aktivität${affectedCount === 1 ? ' ist' : 'en sind'} betroffen.`
              : daysRemoved > 0
                ? `${daysRemoved} Tag${daysRemoved === 1 ? ' wird' : 'e werden'} entfernt. ${affectedCount} Aktivität${affectedCount === 1 ? ' ist' : 'en sind'} betroffen.`
                : `Die Daten haben sich verschoben. ${affectedCount} Aktivität${affectedCount === 1 ? ' ist' : 'en sind'} betroffen.`
            }
          </Text>

          {options.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={styles.optionCard}
              onPress={opt.onPress}
              activeOpacity={0.7}
              disabled={loading}
            >
              <View style={[styles.optionIcon, opt.destructive && styles.optionIconDestructive]}>
                <Icon name={opt.icon} size={20} color={opt.destructive ? colors.error : colors.primary} />
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionLabel, opt.destructive && styles.optionLabelDestructive]}>{opt.label}</Text>
                <Text style={styles.optionDesc}>{opt.description}</Text>
              </View>
            </TouchableOpacity>
          ))}

          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Wird angewendet...</Text>
            </View>
          )}

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={loading}>
            <Text style={styles.cancelText}>Abbrechen</Text>
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
    width: '90%',
    maxWidth: 440,
    maxHeight: '85%',
    ...shadows.lg,
  },
  title: { ...typography.h2, marginBottom: spacing.xs },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  optionIconDestructive: {
    backgroundColor: colors.error + '15',
  },
  optionText: { flex: 1 },
  optionLabel: { ...typography.body, fontWeight: '600', marginBottom: 2 },
  optionLabelDestructive: { color: colors.error },
  optionDesc: { ...typography.caption, color: colors.textLight, lineHeight: 18 },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  loadingText: { ...typography.bodySmall, color: colors.textSecondary },
  cancelBtn: {
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    backgroundColor: colors.background,
    marginTop: spacing.xs,
  },
  cancelText: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
});
