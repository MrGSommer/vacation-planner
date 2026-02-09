import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform } from 'react-native';
import { StripeBuyButton } from './StripeBuyButton';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

interface BuyInspirationenModalProps {
  visible: boolean;
  onClose: () => void;
  onPurchaseDetected?: () => void;
  userId: string;
  email: string;
}

export const BuyInspirationenModal: React.FC<BuyInspirationenModalProps> = ({
  visible, onClose, onPurchaseDetected, userId, email,
}) => {
  if (Platform.OS !== 'web' || !visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Inspirationen kaufen</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.close}>{'✕'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.desc}>20 Inspirationen für CHF 5 — kein Abo nötig.</Text>
          <StripeBuyButton
            userId={userId}
            email={email}
            onPurchaseDetected={() => {
              onPurchaseDetected?.();
              onClose();
            }}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  content: { backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.xl, width: '100%', maxWidth: 480 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { ...typography.h3 },
  close: { fontSize: 20, color: colors.textSecondary, padding: spacing.xs },
  desc: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.lg },
});
