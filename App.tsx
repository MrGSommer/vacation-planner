import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans';
import { AuthProvider } from './src/contexts/AuthContext';
import { SubscriptionProvider } from './src/contexts/SubscriptionContext';
import { TripProvider } from './src/contexts/TripContext';
import { ToastProvider, useToast } from './src/contexts/ToastContext';
import { PlanGenerationProvider } from './src/contexts/PlanGenerationContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ErrorBoundary } from './src/components/common/ErrorBoundary';
import { UpdateBanner } from './src/components/common/UpdateBanner';
import { OfflineBanner } from './src/components/common/OfflineBanner';
import { LoadingScreen } from './src/components/common';

import { logCritical } from './src/services/errorLogger';
import { setOfflineGateToast } from './src/utils/offlineGate';

function OfflineGateInit() {
  const { showToast } = useToast();
  useEffect(() => {
    setOfflineGateToast(showToast);
  }, [showToast]);
  return null;
}

function UnhandledRejectionHandler({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (event: PromiseRejectionEvent) => {
      logCritical(event.reason, {
        component: 'UnhandledPromiseRejection',
        context: { type: 'unhandledrejection' },
      });
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);
  return <>{children}</>;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans: PlusJakartaSans_400Regular,
    'PlusJakartaSans-Medium': PlusJakartaSans_500Medium,
    'PlusJakartaSans-SemiBold': PlusJakartaSans_600SemiBold,
    'PlusJakartaSans-Bold': PlusJakartaSans_700Bold,
  });

  // Remove HTML bootstrap loader once fonts are ready (prevents double spinner)
  useEffect(() => {
    if (Platform.OS === 'web' && fontsLoaded && typeof document !== 'undefined') {
      document.getElementById('app-loader')?.remove();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return <LoadingScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ToastProvider>
          <ErrorBoundary>
            <OfflineGateInit />
            <UnhandledRejectionHandler>
              <AuthProvider>
                <SubscriptionProvider>
                  <TripProvider>
                    <PlanGenerationProvider>
                      <StatusBar style="auto" />
                      <UpdateBanner />
                      <OfflineBanner />
                      <AppNavigator />
                    </PlanGenerationProvider>
                  </TripProvider>
                </SubscriptionProvider>
              </AuthProvider>
            </UnhandledRejectionHandler>
          </ErrorBoundary>
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
