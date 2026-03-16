import React, { createContext, useContext, useMemo } from 'react';
import { useAuthContext } from './AuthContext';
import { TIER_LIMITS, PremiumFeature, SubscriptionTier } from '../config/stripe';

interface SubscriptionContextType {
  tier: SubscriptionTier;
  isPremium: boolean;
  isTrialing: boolean;
  trialDaysLeft: number;
  aiCredits: number;
  paymentWarning: boolean;
  paymentErrorMessage: string | null;
  isTrialExpired: boolean;
  isFeatureAllowed: (feature: PremiumFeature) => boolean;
  canAddTrip: (currentActiveCount: number) => boolean;
  canAddCollaborator: (currentCount: number) => boolean;
  /** Check if a specific trip is editable (free users: only newest active trip) */
  isTripEditable: (tripId: string, allTrips: { id: string; start_date: string; end_date: string }[]) => boolean;
  /** Check if feature data should be shown readonly (sneak peek after downgrade) */
  isSneakPeek: (feature: PremiumFeature, hasData: boolean) => boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  tier: 'free',
  isPremium: false,
  isTrialing: false,
  trialDaysLeft: 0,
  aiCredits: 0,
  paymentWarning: false,
  paymentErrorMessage: null,
  isTrialExpired: false,
  isFeatureAllowed: () => false,
  canAddTrip: () => true,
  canAddCollaborator: () => true,
  isTripEditable: () => true,
  isSneakPeek: () => false,
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

    // Calculate trial days left
    const isTrialing = status === 'trialing' && !trialExpired;
    let trialDaysLeft = 0;
    if (isTrialing && profile?.subscription_period_end) {
      const end = new Date(profile.subscription_period_end);
      const now = new Date();
      trialDaysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
    }

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
      isTrialing,
      trialDaysLeft,
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
      isTripEditable: (tripId: string, allTrips: { id: string; start_date: string; end_date: string }[]) => {
        if (tier === 'premium') return true;
        // Free users: only the newest active trip (by start_date) is editable
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const activeTrips = allTrips
          .filter(t => {
            const end = new Date(t.end_date);
            end.setDate(end.getDate() + 1);
            return end >= now;
          })
          .sort((a, b) => b.start_date.localeCompare(a.start_date)); // newest first
        return activeTrips.length > 0 && activeTrips[0].id === tripId;
      },
      isSneakPeek: (feature: PremiumFeature, hasData: boolean) => {
        // Show readonly view if user is free but has data from when they were premium
        return tier === 'free' && !limits[feature] && hasData;
      },
    };
  }, [
    profile?.subscription_tier, profile?.subscription_status,
    profile?.subscription_period_end, profile?.ai_credits_balance,
    profile?.payment_error_message,
  ]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};
