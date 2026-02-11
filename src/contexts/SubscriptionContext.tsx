import React, { createContext, useContext, useMemo } from 'react';
import { useAuthContext } from './AuthContext';
import { TIER_LIMITS, PremiumFeature, SubscriptionTier } from '../config/stripe';

interface SubscriptionContextType {
  tier: SubscriptionTier;
  isPremium: boolean;
  aiCredits: number;
  paymentWarning: boolean;
  paymentErrorMessage: string | null;
  isTrialExpired: boolean;
  isFeatureAllowed: (feature: PremiumFeature) => boolean;
  canAddTrip: (currentActiveCount: number) => boolean;
  canAddCollaborator: (currentCount: number) => boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  tier: 'free',
  isPremium: false,
  aiCredits: 0,
  paymentWarning: false,
  paymentErrorMessage: null,
  isTrialExpired: false,
  isFeatureAllowed: () => false,
  canAddTrip: () => true,
  canAddCollaborator: () => true,
});

export const useSubscription = () => useContext(SubscriptionContext);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuthContext();

  const value = useMemo<SubscriptionContextType>(() => {
    const status = profile?.subscription_status;
    const isPastDue = status === 'past_due';

    // Check if DB-based trial has expired
    const trialExpired = status === 'trialing' &&
      !!profile?.subscription_period_end &&
      new Date(profile.subscription_period_end) < new Date();

    // past_due keeps premium access (grace period) but shows warning
    // Expired trial → downgrade to free
    const tier: SubscriptionTier = profile?.subscription_tier === 'premium' &&
      (status === 'active' || (status === 'trialing' && !trialExpired) || status === 'past_due')
      ? 'premium'
      : 'free';

    const limits = TIER_LIMITS[tier];

    return {
      tier,
      isPremium: tier === 'premium',
      aiCredits: profile?.ai_credits_balance ?? 0,
      paymentWarning: isPastDue,
      paymentErrorMessage: profile?.payment_error_message ?? null,
      isTrialExpired: trialExpired,
      isFeatureAllowed: (feature: PremiumFeature) => {
        if (feature === 'ai') return limits[feature] || (profile?.ai_credits_balance ?? 0) > 0;
        return limits[feature];
      },
      canAddTrip: (currentActiveCount: number) => currentActiveCount < limits.maxActiveTrips,
      canAddCollaborator: (currentCount: number) => currentCount < limits.maxCollaboratorsPerTrip,
    };
  }, [profile?.subscription_tier, profile?.subscription_status, profile?.subscription_period_end, profile?.ai_credits_balance, profile?.payment_error_message]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};
