import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { SubscriptionProvider } from './src/contexts/SubscriptionContext';
import { TripProvider } from './src/contexts/TripContext';
import { ToastProvider } from './src/contexts/ToastContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ErrorBoundary } from './src/components/common/ErrorBoundary';
import { logCritical } from './src/services/errorLogger';

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
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ToastProvider>
          <ErrorBoundary>
            <UnhandledRejectionHandler>
              <AuthProvider>
                <SubscriptionProvider>
                  <TripProvider>
                    <StatusBar style="auto" />
                    <AppNavigator />
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
