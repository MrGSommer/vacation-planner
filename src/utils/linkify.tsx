import React from 'react';
import { Text, Platform, Linking, StyleSheet } from 'react-native';
import { colors, typography } from './theme';

const URL_REGEX = /(https?:\/\/[^\s<>)"']+)/g;

const isMobileWeb = () => {
  if (Platform.OS !== 'web') return false;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
};

/** Open an external URL. On mobile web uses location.assign to avoid ghost tabs. */
export const openExternalUrl = (url: string) => {
  if (Platform.OS !== 'web') {
    Linking.openURL(url);
  } else if (isMobileWeb()) {
    window.location.assign(url);
  } else {
    window.open(url, '_blank', 'noopener');
  }
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
          onPress={() => openExternalUrl(part)}
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
