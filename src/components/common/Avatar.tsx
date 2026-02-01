import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { colors, borderRadius } from '../../utils/theme';

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
}

export const Avatar: React.FC<AvatarProps> = ({ uri, name, size = 40 }) => {
  const initials = name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';

  if (uri) {
    return <Image source={{ uri }} style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]} />;
  }

  return (
    <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{initials}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  image: { backgroundColor: colors.border },
  placeholder: { backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#FFFFFF', fontWeight: '700' },
});
