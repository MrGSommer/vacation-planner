import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Platform } from 'react-native';
import { Icon, IconName } from '../../utils/icons';
import { colors, spacing, borderRadius, typography, shadows, iconSize } from '../../utils/theme';

export interface ContextMenuItem {
  label: string;
  icon: IconName;
  onPress: () => void;
  destructive?: boolean;
}

interface ContextMenuProps {
  visible: boolean;
  onClose: () => void;
  items: ContextMenuItem[];
  /** Position on screen (x, y) */
  position: { x: number; y: number };
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ visible, onClose, items, position }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, damping: 25, stiffness: 400, useNativeDriver: true }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.9);
    }
  }, [visible, fadeAnim, scaleAnim]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <Animated.View
          style={[
            styles.menu,
            {
              top: position.y,
              left: position.x,
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {items.map((item, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.menuItem, i < items.length - 1 && styles.menuItemBorder]}
              onPress={() => { onClose(); item.onPress(); }}
              activeOpacity={0.7}
            >
              <Icon
                name={item.icon}
                size={iconSize.sm}
                color={item.destructive ? colors.error : colors.text}
              />
              <Text style={[styles.menuLabel, item.destructive && styles.menuLabelDestructive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  menu: {
    position: 'absolute',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    minWidth: 180,
    ...shadows.lg,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  menuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuLabel: {
    ...typography.body,
    fontSize: 14,
  },
  menuLabelDestructive: {
    color: colors.error,
  },
});
