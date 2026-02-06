export const STRIPE_CONFIG = {
  publishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
  priceMonthly: process.env.EXPO_PUBLIC_STRIPE_PRICE_MONTHLY || 'price_1SxlEiGtIWkM8nDay8lOyYFi',
  priceYearly: process.env.EXPO_PUBLIC_STRIPE_PRICE_YEARLY || 'price_1SxlEoGtIWkM8nDafyxYhBKm',
  priceAiCredits: process.env.EXPO_PUBLIC_STRIPE_PRICE_AI_CREDITS || 'price_1SxlEwGtIWkM8nDajb7o9wz7',
} as const;

export const TIER_LIMITS = {
  free: {
    maxActiveTrips: 2,
    maxPastTrips: 1,
    maxCollaboratorsPerTrip: 2,
    photos: false,
    stops: false,
    ai: false,
  },
  premium: {
    maxActiveTrips: Infinity,
    maxPastTrips: Infinity,
    maxCollaboratorsPerTrip: Infinity,
    photos: true,
    stops: true,
    ai: true,
  },
} as const;

export type SubscriptionTier = keyof typeof TIER_LIMITS;
export type PremiumFeature = 'photos' | 'stops' | 'ai';
