import React, { useEffect, useRef } from 'react';
import { Modal, View, TouchableOpacity, StyleSheet, Animated, Dimensions, Platform, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, shadows } from '../../utils/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ModalWrapperProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Position: 'center' (default, dialog) or 'bottom' (sheet) */
  position?: 'center' | 'bottom';
  /** Max width for center modals */
  maxWidth?: number;
  /** Disable backdrop press to close */
  persistent?: boolean;
  /** Add extra padding at bottom for keyboard */
  avoidKeyboard?: boolean;
}

export const ModalWrapper: React.FC<ModalWrapperProps> = ({
  visible,
  onClose,
  children,
  position = 'center',
  maxWidth = 480,
  persistent = false,
  avoidKeyboard = false,
}) => {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(position === 'bottom' ? SCREEN_HEIGHT : 30)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, damping: 25, stiffness: 300, useNativeDriver: true }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(position === 'bottom' ? SCREEN_HEIGHT : 30);
    }
  }, [visible, fadeAnim, slideAnim, position]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, {
        toValue: position === 'bottom' ? SCREEN_HEIGHT : 30,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  };

  const content = (
    <Animated.View
      style={[
        position === 'center' ? [styles.centerModal, { maxWidth }] : [styles.bottomSheet, { paddingBottom: insets.bottom + spacing.lg }],
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      {/* Prevent backdrop press from propagating */}
      <TouchableOpacity activeOpacity={1} onPress={undefined} style={{ width: '100%' }}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={persistent ? undefined : handleClose}>
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={[styles.backdropTouch, position === 'center' && styles.centered, position === 'bottom' && styles.bottomAligned]}
          activeOpacity={1}
          onPress={persistent ? undefined : handleClose}
        >
          {avoidKeyboard ? (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', alignItems: position === 'center' ? 'center' : 'stretch' }}>
              {content}
            </KeyboardAvoidingView>
          ) : content}
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backdropTouch: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  bottomAligned: {
    justifyContent: 'flex-end',
  },
  centerModal: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '100%',
    ...shadows.lg,
  },
  bottomSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
    ...shadows.lg,
  },
});
