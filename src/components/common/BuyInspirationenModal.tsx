import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../api/supabase';
import { STRIPE_CONFIG } from '../../config/stripe';
import { colors, spacing, borderRadius, typography, iconSize, gradients } from '../../utils/theme';
import { Icon } from '../../utils/icons';
import { logError } from '../../services/errorLogger';

interface BuyInspirationenModalProps {
  visible: boolean;
  onClose: () => void;
  onPurchaseDetected?: () => void;
  userId: string;
  email: string;
}

export const BuyInspirationenModal: React.FC<BuyInspirationenModalProps> = ({
  visible, onClose, userId, email,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (Platform.OS !== 'web' || !visible) return null;

  const handleBuy = async () => {
    setLoading(true);
    setError(null);
    try {
      // Pass current path as cancel URL so user returns here on abort
      const cancelPath = typeof window !== 'undefined' ? window.location.pathname : '/subscription-cancel';
      const res = await supabase.functions.invoke('create-checkout-session', {
        body: {
          priceId: STRIPE_CONFIG.priceAiCredits,
          product: 'inspirationen',
          mode: 'payment',
          cancelPath,
        },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        throw new Error('Keine Checkout-URL erhalten');
      }
    } catch (e) {
      logError(e, { severity: 'critical', component: 'BuyInspirationenModal', context: { action: 'handleBuy' } });
      setError((e as Error).message || 'Fehler beim Erstellen der Bezahlseite');
      setLoading(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Inspirationen kaufen</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="close" size={iconSize.md} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.offerCard}>
            <View style={styles.offerIcon}>
              <Icon name="sparkles" size={24} color={gradients.sunset[0]} />
            </View>
            <View style={styles.offerInfo}>
              <Text style={styles.offerTitle}>20 Inspirationen</Text>
              <Text style={styles.offerPrice}>CHF 5 · Einmalkauf</Text>
            </View>
          </View>

          <Text style={styles.desc}>
            Inspirationen werden sofort gutgeschrieben. Kein Abo nötig.
          </Text>

          {error && (
            <Text style={styles.errorText}>{error}</Text>
          )}

          <TouchableOpacity style={styles.buyButton} onPress={handleBuy} activeOpacity={0.8} disabled={loading}>
            <LinearGradient
              colors={[...gradients.sunset]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.buyGradient, loading && { opacity: 0.7 }]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Icon name="cart-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.buyText}>Jetzt kaufen</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.hint}>Sichere Zahlung über Stripe · Zurück-Button verfügbar</Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  content: { backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.xl, width: '100%', maxWidth: 420 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  title: { ...typography.h3 },
  offerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  offerIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: gradients.sunset[0] + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerInfo: { flex: 1 },
  offerTitle: { ...typography.body, fontWeight: '600', color: colors.text },
  offerPrice: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  desc: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.lg },
  errorText: { ...typography.bodySmall, color: colors.error, marginBottom: spacing.sm, textAlign: 'center' },
  buyButton: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  buyGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  buyText: { ...typography.button, color: '#FFFFFF', fontSize: 16 },
  hint: { ...typography.caption, color: colors.textLight, textAlign: 'center' },
});
