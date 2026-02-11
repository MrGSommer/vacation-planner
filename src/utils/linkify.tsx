import React from 'react';
import { Text, Platform, Linking, StyleSheet } from 'react-native';
import { colors, typography } from './theme';

const URL_REGEX = /(https?:\/\/[^\s<>)"']+)/g;

const openUrl = (url: string) => {
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
  else Linking.openURL(url);
};

/** Split text into plain strings and clickable <Text> links. */
export function linkifyText(text: string, linkStyle?: object): React.ReactNode[] {
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) => {
    if (URL_REGEX.test(part)) {
      URL_REGEX.lastIndex = 0; // reset stateful regex
      return (
        <Text
          key={i}
          style={[styles.link, linkStyle]}
          onPress={() => openUrl(part)}
          accessibilityRole="link"
        >
          {part}
        </Text>
      );
    }
    return part;
  });
}

const styles = StyleSheet.create({
  link: {
    ...typography.body,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});
