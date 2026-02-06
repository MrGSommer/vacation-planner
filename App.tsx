import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { SubscriptionProvider } from './src/contexts/SubscriptionContext';
import { TripProvider } from './src/contexts/TripContext';
import { ToastProvider } from './src/contexts/ToastContext';
import { AppNavigator } from './src/navigation/AppNavigator';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ToastProvider>
          <AuthProvider>
            <SubscriptionProvider>
              <TripProvider>
                <StatusBar style="auto" />
                <AppNavigator />
              </TripProvider>
            </SubscriptionProvider>
          </AuthProvider>
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
