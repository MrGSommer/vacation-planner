export const STRIPE_CONFIG = {
  publishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
  priceMonthly: process.env.EXPO_PUBLIC_STRIPE_PRICE_MONTHLY || 'price_1SxlEiGtIWkM8nDay8lOyYFi',
  priceYearly: process.env.EXPO_PUBLIC_STRIPE_PRICE_YEARLY || 'price_1SxlEoGtIWkM8nDafyxYhBKm',
  priceAiCredits: process.env.EXPO_PUBLIC_STRIPE_PRICE_AI_CREDITS || 'price_1SxlEwGtIWkM8nDajb7o9wz7',
  paymentLinkMonthly: 'https://buy.stripe.com/fZu4gz0Fufgsgfhd8ca7C00',
  paymentLinkYearly: 'https://buy.stripe.com/dRmdR9ewkeco4wz0lqa7C01',
  paymentLinkInspirations: 'https://buy.stripe.com/6oUbJ173S3xKgfh8RWa7C02',
  buyButtonInspirations: process.env.EXPO_PUBLIC_STRIPE_BUY_BUTTON_INSPIRATIONS || 'buy_btn_1SyvzQGtIWkM8nDaNDTgPAo2',
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
