import React, { useRef, useCallback } from 'react';
import { View, StyleSheet, Animated, PanResponder, TouchableOpacity, Text, Platform } from 'react-native';
import { Icon, IconName } from '../../utils/icons';
import { colors, spacing, borderRadius, iconSize } from '../../utils/theme';

const isWeb = Platform.OS === 'web';

export interface SwipeAction {
  icon: IconName;
  color: string;
  onPress: () => void;
}

interface SwipeableRowProps {
  children: React.ReactNode;
  actions: SwipeAction[];
  /** Width of each action button */
  actionWidth?: number;
  /** Disable swipe (e.g. during drag) */
  disabled?: boolean;
}

const ACTION_WIDTH = 64;

/**
 * Wraps children with left-swipe to reveal action buttons.
 * Swipe left to reveal, swipe right or tap backdrop to close.
 */
export const SwipeableRow: React.FC<SwipeableRowProps> = ({
  children,
  actions,
  actionWidth = ACTION_WIDTH,
  disabled = false,
}) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);
  const totalWidth = actions.length * actionWidth;

  const snapTo = useCallback((toValue: number) => {
    Animated.spring(translateX, {
      toValue,
      damping: 25,
      stiffness: 300,
      useNativeDriver: true,
    }).start();
    isOpen.current = toValue !== 0;
  }, [translateX]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        !disabled && Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onMoveShouldSetPanResponderCapture: (_, gs) =>
        !disabled && Math.abs(gs.dx) > 15 && Math.abs(gs.dx) > Math.abs(gs.dy) * 2,
      onPanResponderMove: (_, gs) => {
        const base = isOpen.current ? -totalWidth : 0;
        const val = Math.min(0, Math.max(-totalWidth - 20, base + gs.dx));
        translateX.setValue(val);
      },
      onPanResponderRelease: (_, gs) => {
        if (isOpen.current) {
          // Already open: swipe right to close, or stay open
          if (gs.dx > 20) {
            snapTo(0);
          } else {
            snapTo(-totalWidth);
          }
        } else {
          // Closed: swipe left to open
          if (gs.dx < -20) {
            snapTo(-totalWidth);
          } else {
            snapTo(0);
          }
        }
      },
    })
  ).current;

  const close = useCallback(() => snapTo(0), [snapTo]);

  if (actions.length === 0) return <>{children}</>;

  return (
    <View style={styles.container}>
      {/* Actions behind the content */}
      <View style={[styles.actionsContainer, { width: totalWidth }]}>
        {actions.map((action, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.actionBtn, { width: actionWidth, backgroundColor: action.color }]}
            onPress={() => { close(); action.onPress(); }}
            activeOpacity={0.8}
          >
            <Icon name={action.icon} size={iconSize.md} color="#FFFFFF" />
          </TouchableOpacity>
        ))}
      </View>

      {/* Swipeable content */}
      <Animated.View
        style={[styles.content, { transform: [{ translateX }] }, isWeb && { touchAction: 'pan-y' } as any]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  actionsContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  actionBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    backgroundColor: colors.background,
  },
});
