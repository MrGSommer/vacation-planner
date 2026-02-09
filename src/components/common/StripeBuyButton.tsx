import React, { useEffect, useRef } from 'react';
import { View, Platform } from 'react-native';
import { STRIPE_CONFIG } from '../../config/stripe';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../contexts/SubscriptionContext';

interface StripeBuyButtonProps {
  userId: string;
  email: string;
  onPurchaseDetected?: () => void;
}

export const StripeBuyButton: React.FC<StripeBuyButtonProps> = ({ userId, email, onPurchaseDetected }) => {
  const containerRef = useRef<View>(null);
  const { refreshProfile } = useAuth();
  const { aiCredits } = useSubscription();
  const initialCredits = useRef(aiCredits);
  const detected = useRef(false);

  // Inject Stripe Buy Button into DOM
  useEffect(() => {
    if (Platform.OS !== 'web' || !containerRef.current) return;

    const container = containerRef.current as unknown as HTMLDivElement;

    if (!document.querySelector('script[src*="buy-button.js"]')) {
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/buy-button.js';
      script.async = true;
      document.head.appendChild(script);
    }

    const btn = document.createElement('stripe-buy-button');
    btn.setAttribute('buy-button-id', STRIPE_CONFIG.buyButtonInspirations);
    btn.setAttribute('publishable-key', STRIPE_CONFIG.publishableKey);
    btn.setAttribute('client-reference-id', userId);
    btn.setAttribute('customer-email', email);
    container.appendChild(btn);

    return () => {
      container.innerHTML = '';
    };
  }, [userId, email]);

  // Poll refreshProfile every 3s to detect credit changes from webhook
  useEffect(() => {
    if (Platform.OS !== 'web' || detected.current) return;

    const interval = setInterval(() => {
      refreshProfile();
    }, 3000);

    return () => clearInterval(interval);
  }, [refreshProfile]);

  // Detect credit increase → purchase successful
  useEffect(() => {
    if (!detected.current && aiCredits > initialCredits.current) {
      detected.current = true;
      onPurchaseDetected?.();
    }
  }, [aiCredits, onPurchaseDetected]);

  if (Platform.OS !== 'web') return null;

  return <View ref={containerRef} />;
};
