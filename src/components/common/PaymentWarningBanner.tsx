import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { createPortalSession } from '../../api/stripe';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

interface Props {
  message?: string | null;
}

export const PaymentWarningBanner: React.FC<Props> = ({ message }) => {
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    setLoading(true);
    try {
      const { url } = await createPortalSession();
      if (Platform.OS === 'web') window.location.href = url;
    } catch {
      // Ignore — user can try again
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        {message || 'Zahlung fehlgeschlagen. Bitte aktualisiere deine Zahlungsmethode.'}
      </Text>
      <TouchableOpacity
        style={[styles.button, loading && { opacity: 0.6 }]}
        onPress={handlePress}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? '...' : 'Zahlungsmethode ändern'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FFF3CD',
    borderWidth: 1,
    borderColor: '#FFEEBA',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  text: {
    ...typography.bodySmall,
    color: '#856404',
    marginBottom: spacing.sm,
  },
  button: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  buttonText: {
    ...typography.bodySmall,
    color: '#856404',
    fontWeight: '700',
  },
});
