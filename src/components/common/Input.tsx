import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, TextInputProps, TouchableOpacity } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  rightIcon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ label, error, rightIcon, style, ...props }) => {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputContainer, focused && styles.focused, error && styles.errorBorder]}>
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.textLight}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
        />
        {rightIcon && <View style={styles.icon}>{rightIcon}</View>}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
  },
  focused: { borderColor: colors.primary },
  errorBorder: { borderColor: colors.error },
  input: { flex: 1, height: 48, ...typography.body, color: colors.text },
  icon: { marginLeft: spacing.sm },
  error: { ...typography.caption, color: colors.error, marginTop: spacing.xs },
});
