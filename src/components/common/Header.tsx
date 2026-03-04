import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography, iconSize } from '../../utils/theme';
import { Icon, NAV_ICONS } from '../../utils/icons';

interface HeaderProps {
  title: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, onBack, rightAction }) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.row}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name={NAV_ICONS.back} size={iconSize.lg} color={colors.primary} />
          </TouchableOpacity>
        ) : <View style={styles.backButton} />}
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={styles.rightAction}>{rightAction}</View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { backgroundColor: colors.card, paddingBottom: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center' },
  backButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-start' },
  title: { ...typography.h3, flex: 1, textAlign: 'center' },
  rightAction: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
});
