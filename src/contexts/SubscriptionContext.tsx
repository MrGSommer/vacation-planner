import React, { createContext, useContext, useMemo } from 'react';
import { useAuthContext } from './AuthContext';
import { TIER_LIMITS, PremiumFeature, SubscriptionTier } from '../config/stripe';

interface SubscriptionContextType {
  tier: SubscriptionTier;
  isPremium: boolean;
  aiCredits: number;
  isFeatureAllowed: (feature: PremiumFeature) => boolean;
  canAddTrip: (currentActiveCount: number) => boolean;
  canAddCollaborator: (currentCount: number) => boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  tier: 'free',
  isPremium: false,
  aiCredits: 0,
  isFeatureAllowed: () => false,
  canAddTrip: () => true,
  canAddCollaborator: () => true,
});

export const useSubscription = () => useContext(SubscriptionContext);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuthContext();

  const value = useMemo<SubscriptionContextType>(() => {
    const tier: SubscriptionTier = profile?.subscription_tier === 'premium' &&
      (profile.subscription_status === 'active' || profile.subscription_status === 'trialing')
      ? 'premium'
      : 'free';

    const limits = TIER_LIMITS[tier];

    return {
      tier,
      isPremium: tier === 'premium',
      aiCredits: profile?.ai_credits_balance ?? 0,
      isFeatureAllowed: (feature: PremiumFeature) => {
        if (feature === 'ai') return limits[feature] || (profile?.ai_credits_balance ?? 0) > 0;
        return limits[feature];
      },
      canAddTrip: (currentActiveCount: number) => currentActiveCount < limits.maxActiveTrips,
      canAddCollaborator: (currentCount: number) => currentCount < limits.maxCollaboratorsPerTrip,
    };
  }, [profile?.subscription_tier, profile?.subscription_status, profile?.ai_credits_balance]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};
