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
    maxActiveTrips: 1,
    maxPastTrips: 0,
    maxCollaboratorsPerTrip: 2,
    photos: false,
    stops: false,
    ai: false,
    budget: false,
  },
  premium: {
    maxActiveTrips: Infinity,
    maxPastTrips: Infinity,
    maxCollaboratorsPerTrip: Infinity,
    photos: true,
    stops: true,
    ai: true,
    budget: true,
  },
} as const;

export type SubscriptionTier = keyof typeof TIER_LIMITS;
export type PremiumFeature = 'photos' | 'stops' | 'ai' | 'budget';

/** Days of free trial for new users */
export const TRIAL_DAYS = 14;

/** Auto-delete free user trips X days after end_date */
export const FREE_TRIP_RETENTION_DAYS = 14;
