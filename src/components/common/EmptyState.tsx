import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, iconSize } from '../../utils/theme';
import { Icon, IconName } from '../../utils/icons';
import { Button } from './Button';

interface EmptyStateProps {
  /** @deprecated Use iconName instead */
  icon?: string;
  /** Ionicons name — preferred over emoji `icon` */
  iconName?: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, iconName, title, message, actionLabel, onAction, secondaryActionLabel, onSecondaryAction }) => (
  <View style={styles.container}>
    {iconName ? (
      <View style={styles.iconWrap}>
        <Icon name={iconName} size={52} color={colors.secondary} />
      </View>
    ) : (
      <Text style={styles.icon}>{icon}</Text>
    )}
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.message}>{message}</Text>
    {actionLabel && onAction && (
      <Button title={actionLabel} onPress={onAction} style={styles.button} />
    )}
    {secondaryActionLabel && onSecondaryAction && (
      <Button title={secondaryActionLabel} onPress={onSecondaryAction} variant="ghost" style={styles.secondaryButton} />
    )}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  iconWrap: { marginBottom: spacing.md, width: 80, height: 80, borderRadius: 40, backgroundColor: colors.secondary + '12', alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 64, marginBottom: spacing.md },
  title: { ...typography.h2, textAlign: 'center', marginBottom: spacing.sm },
  message: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
  button: { minWidth: 200 },
  secondaryButton: { minWidth: 200, marginTop: spacing.sm },
});
