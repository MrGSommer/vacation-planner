import { Platform } from 'react-native';

export const colors = {
  primary: '#FF6B6B',
  primaryLight: '#FF8B94',
  secondary: '#4ECDC4',
  accent: '#6C5CE7',
  sky: '#74B9FF',
  sunny: '#FFD93D',
  text: '#2D3436',
  textSecondary: '#636E72',
  textLight: '#B2BEC3',
  background: '#F8F9FA',
  card: '#FFFFFF',
  border: '#DFE6E9',
  error: '#E17055',
  success: '#00B894',
  warning: '#FDCB6E',
} as const;

export const gradients = {
  sunset: ['#FF6B6B', '#FF8B94', '#FFD93D'] as const,
  ocean: ['#4ECDC4', '#74B9FF', '#6C5CE7'] as const,
  primary: ['#FF6B6B', '#FF8B94'] as const,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const borderRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

// Font family — loaded via expo-google-fonts in App.tsx
const FONT_FAMILY = Platform.select({
  web: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  default: 'PlusJakartaSans',
});

export const fontFamily = {
  regular: FONT_FAMILY,
  medium: FONT_FAMILY,
  semiBold: FONT_FAMILY,
  bold: FONT_FAMILY,
} as const;

// Platform-safe fontWeight — on web we use fontFamily variant, on native fontWeight
const weight = (w: '400' | '500' | '600' | '700') => ({
  fontWeight: w as '400' | '500' | '600' | '700',
  fontFamily: FONT_FAMILY,
});

export const typography = {
  h1: { fontSize: 28, ...weight('700'), color: colors.text },
  h2: { fontSize: 22, ...weight('700'), color: colors.text },
  h3: { fontSize: 18, ...weight('600'), color: colors.text },
  body: { fontSize: 16, ...weight('400'), color: colors.text },
  bodySmall: { fontSize: 14, ...weight('400'), color: colors.textSecondary },
  caption: { fontSize: 12, ...weight('400'), color: colors.textLight },
  button: { fontSize: 16, ...weight('600') },
} as const;

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;

// Icon sizes for consistent Ionicons usage
export const iconSize = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 28,
  xl: 32,
} as const;
