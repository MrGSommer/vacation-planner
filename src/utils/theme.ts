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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, color: colors.text },
  h2: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  h3: { fontSize: 18, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 16, fontWeight: '400' as const, color: colors.text },
  bodySmall: { fontSize: 14, fontWeight: '400' as const, color: colors.textSecondary },
  caption: { fontSize: 12, fontWeight: '400' as const, color: colors.textLight },
  button: { fontSize: 16, fontWeight: '600' as const },
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
