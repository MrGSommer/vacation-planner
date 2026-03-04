import React, { useState, useRef, useEffect } from 'react';
import { Text, TextInput, StyleSheet, TextStyle, TouchableOpacity, Platform, View } from 'react-native';
import { colors, spacing, borderRadius } from '../../utils/theme';

interface InlineEditTextProps {
  value: string;
  onSave: (newValue: string) => void;
  style?: TextStyle;
  placeholder?: string;
  /** Allow empty values (default: false) */
  allowEmpty?: boolean;
  /** Max length */
  maxLength?: number;
  /** Number of lines for the text display */
  numberOfLines?: number;
}

/**
 * A text element that becomes an inline TextInput on tap.
 * Saves on blur or Enter. Reverts on Escape.
 */
export const InlineEditText: React.FC<InlineEditTextProps> = ({
  value,
  onSave,
  style,
  placeholder,
  allowEmpty = false,
  maxLength,
  numberOfLines = 1,
}) => {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleStartEdit = () => {
    setEditValue(value);
    setEditing(true);
    // Focus needs a small delay on web
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (!allowEmpty && !trimmed) {
      setEditValue(value);
      setEditing(false);
      return;
    }
    if (trimmed !== value) {
      onSave(trimmed);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setEditing(false);
  };

  const handleKeyPress = (e: any) => {
    if (e.nativeEvent.key === 'Enter') {
      e.preventDefault?.();
      handleSave();
    } else if (e.nativeEvent.key === 'Escape') {
      handleCancel();
    }
  };

  if (editing) {
    return (
      <TextInput
        ref={inputRef}
        style={[style, styles.input]}
        value={editValue}
        onChangeText={setEditValue}
        onBlur={handleSave}
        onKeyPress={handleKeyPress}
        maxLength={maxLength}
        selectTextOnFocus
        autoFocus
      />
    );
  }

  return (
    <TouchableOpacity onPress={handleStartEdit} activeOpacity={0.7}>
      <View style={styles.textWrap}>
        <Text style={[style, !value && styles.placeholder]} numberOfLines={numberOfLines}>
          {value || placeholder || 'Tippen zum Bearbeiten'}
        </Text>
        {Platform.OS === 'web' && (
          <View style={styles.editHint} />
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  input: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    paddingVertical: 2,
    paddingHorizontal: 0,
    margin: 0,
    backgroundColor: 'transparent',
  },
  textWrap: {
    position: 'relative',
  },
  placeholder: {
    color: colors.textLight,
    fontStyle: 'italic',
  },
  editHint: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'transparent',
  },
});
