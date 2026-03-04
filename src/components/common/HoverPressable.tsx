import React, { useState, useCallback } from 'react';
import { Pressable, PressableProps, StyleSheet, Platform, ViewStyle } from 'react-native';

interface HoverPressableProps extends PressableProps {
  /** Style to merge on hover (web only) */
  hoverStyle?: ViewStyle;
  /** Scale factor on hover, default 1.02 */
  hoverScale?: number;
  /** Opacity on press, default 0.7 */
  activeOpacity?: number;
}

/**
 * Pressable wrapper that adds:
 * - cursor:pointer on web
 * - Hover opacity/scale on web
 * - Press opacity on all platforms
 */
export const HoverPressable: React.FC<HoverPressableProps> = ({
  children,
  style,
  hoverStyle,
  hoverScale,
  activeOpacity = 0.7,
  disabled,
  ...rest
}) => {
  const [hovered, setHovered] = useState(false);

  const handleHoverIn = useCallback(() => setHovered(true), []);
  const handleHoverOut = useCallback(() => setHovered(false), []);

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onHoverIn={Platform.OS === 'web' ? handleHoverIn : undefined}
      onHoverOut={Platform.OS === 'web' ? handleHoverOut : undefined}
      style={({ pressed }) => [
        Platform.OS === 'web' && !disabled && styles.cursor,
        typeof style === 'function' ? style({ pressed }) : style,
        pressed && { opacity: activeOpacity },
        Platform.OS === 'web' && hovered && !disabled && [
          hoverScale ? { transform: [{ scale: hoverScale }] } : undefined,
          hoverStyle || styles.defaultHover,
        ],
      ]}
    >
      {children}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  cursor: {
    // @ts-ignore — web only
    cursor: 'pointer',
  },
  defaultHover: {
    opacity: 0.85,
  },
});
