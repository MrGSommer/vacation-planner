import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Dimensions } from 'react-native';
import { Icon, IconName } from '../../utils/icons';
import { colors, spacing, borderRadius, typography, shadows, iconSize } from '../../utils/theme';

const MENU_WIDTH = 180;
const ITEM_HEIGHT = 42; // approx per item

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

  const clampedPos = useMemo(() => {
    const screenW = typeof window !== 'undefined' ? window.innerWidth : Dimensions.get('window').width;
    const screenH = typeof window !== 'undefined' ? window.innerHeight : Dimensions.get('window').height;
    const menuH = items.length * ITEM_HEIGHT;

    let top = position.y;
    let left = position.x;

    // Clamp right edge
    if (left + MENU_WIDTH > screenW - 8) {
      left = screenW - MENU_WIDTH - 8;
    }
    left = Math.max(8, left);

    // If menu goes below screen, flip above
    if (top + menuH > screenH - 8) {
      top = position.y - menuH;
    }
    top = Math.max(8, top);

    return { top, left };
  }, [position.x, position.y, items.length]);

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
              top: clampedPos.top,
              left: clampedPos.left,
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
