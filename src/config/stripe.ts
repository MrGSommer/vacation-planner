const _pk = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
if (!_pk) console.error('STRIPE: EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY not set');

export const STRIPE_CONFIG = {
  publishableKey: _pk || '',
  priceMonthly: process.env.EXPO_PUBLIC_STRIPE_PRICE_MONTHLY || '',
  priceYearly: process.env.EXPO_PUBLIC_STRIPE_PRICE_YEARLY || '',
  priceAiCredits: process.env.EXPO_PUBLIC_STRIPE_PRICE_AI_CREDITS || '',
  paymentLinkMonthly: 'https://buy.stripe.com/fZu4gz0Fufgsgfhd8ca7C00',
  paymentLinkYearly: 'https://buy.stripe.com/dRmdR9ewkeco4wz0lqa7C01',
  paymentLinkInspirations: 'https://buy.stripe.com/6oUbJ173S3xKgfh8RWa7C02',
  buyButtonInspirations: process.env.EXPO_PUBLIC_STRIPE_BUY_BUTTON_INSPIRATIONS || '',
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
