import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Input } from './Input';
import { colors } from '../../utils/theme';

interface PasswordInputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  label = 'Passwort',
  placeholder = 'Dein Passwort',
  value,
  onChangeText,
  error,
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Input
      label={label}
      placeholder={placeholder}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={!showPassword}
      error={error}
      rightIcon={
        <TouchableOpacity
          onPress={() => setShowPassword(prev => !prev)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.toggle}
        >
          <Text style={styles.icon}>{showPassword ? '👁' : '👁‍🗨'}</Text>
        </TouchableOpacity>
      }
    />
  );
};

const styles = StyleSheet.create({
  toggle: { padding: 4 },
  icon: { fontSize: 18, color: colors.textLight },
});
