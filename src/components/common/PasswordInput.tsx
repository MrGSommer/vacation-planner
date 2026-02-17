import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Input } from './Input';
import { colors } from '../../utils/theme';

interface PasswordInputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
}

const EyeIcon = ({ visible }: { visible: boolean }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    {visible ? (
      <>
        <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke={colors.textLight} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" stroke={colors.textLight} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </>
    ) : (
      <>
        <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke={colors.textLight} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M1 1l22 22" stroke={colors.textLight} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </>
    )}
  </Svg>
);

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
          <EyeIcon visible={showPassword} />
        </TouchableOpacity>
      }
    />
  );
};

const styles = StyleSheet.create({
  toggle: { padding: 4 },
});
