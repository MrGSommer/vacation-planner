import React, { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthContext } from '../contexts/AuthContext';
import { LoadingScreen } from '../components/common';
import { FloatingFeedbackButton } from '../components/common/FloatingFeedbackButton';
import { AuthNavigator } from './AuthNavigator';
import { MainNavigator } from './MainNavigator';
import { CreateTripScreen } from '../screens/trip/CreateTripScreen';
import { EditTripScreen } from '../screens/trip/EditTripScreen';
import { TripDetailScreen } from '../screens/trip/TripDetailScreen';
import { ItineraryScreen } from '../screens/trip/ItineraryScreen';
import { MapScreen } from '../screens/trip/MapScreenWrapper';
import { PhotosScreen } from '../screens/trip/PhotosScreen';
import { BudgetScreen } from '../screens/trip/BudgetScreen';
import { PackingScreen } from '../screens/trip/PackingScreen';
import { StopsScreen } from '../screens/trip/StopsScreen';
import { EditProfileScreen } from '../screens/profile/EditProfileScreen';
import { NotificationsScreen } from '../screens/profile/NotificationsScreen';
import { LanguageCurrencyScreen } from '../screens/profile/LanguageCurrencyScreen';
import { FeedbackScreen } from '../screens/profile/FeedbackScreen';
import { AcceptInviteScreen } from '../screens/invite/AcceptInviteScreen';
import { TripShareScreen } from '../screens/share/TripShareScreen';
import { SubscriptionScreen } from '../screens/subscription/SubscriptionScreen';
import { SubscriptionSuccessScreen } from '../screens/subscription/SubscriptionSuccessScreen';
import { SubscriptionCancelScreen } from '../screens/subscription/SubscriptionCancelScreen';
import { DatenschutzScreen } from '../screens/legal/DatenschutzScreen';
import { AGBScreen } from '../screens/legal/AGBScreen';
import { ImpressumScreen } from '../screens/legal/ImpressumScreen';
import { RootStackParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking = {
  prefixes: ['https://wayfable.ch', 'wayfable://'],
  config: {
    screens: {
      AcceptInvite: 'invite/:token',
      TripShare: 'share/:token',
      SubscriptionSuccess: 'subscription-success',
      SubscriptionCancel: 'subscription-cancel',
      TripDetail: 'trip/:tripId',
      Itinerary: 'trip/:tripId/itinerary',
      Map: 'trip/:tripId/map',
      Photos: 'trip/:tripId/photos',
      Budget: 'trip/:tripId/budget',
      Packing: 'trip/:tripId/packing',
      Stops: 'trip/:tripId/stops',
      EditTrip: 'trip/:tripId/edit',
      CreateTrip: 'trip/new',
      EditProfile: 'profile/edit',
      Notifications: 'notifications',
      LanguageCurrency: 'settings/language',
      Subscription: 'subscription',
      Datenschutz: 'datenschutz',
      AGB: 'agb',
      Impressum: 'impressum',
      FeedbackModal: 'feedback',
      Main: {
        screens: {
          Home: '',
          Profile: 'profile',
        },
      },
    },
  },
};

export const AppNavigator: React.FC = () => {
  const { session, loading, pendingInviteToken, setPendingInviteToken } = useAuthContext();
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const prevSessionRef = useRef(session);
  const [currentRoute, setCurrentRoute] = useState('');

  // Extract invite token from URL when user is not logged in
  useEffect(() => {
    if (Platform.OS !== 'web' || session) return;
    const path = window.location.pathname;
    const match = path.match(/^\/invite\/(.+)$/);
    if (match) {
      setPendingInviteToken(match[1]);
    }
  }, [session, setPendingInviteToken]);

  // After login: if pendingInviteToken exists, navigate to AcceptInvite
  useEffect(() => {
    if (!prevSessionRef.current && session && pendingInviteToken) {
      // Small delay to let navigator mount
      setTimeout(() => {
        navigationRef.current?.navigate('AcceptInvite', { token: pendingInviteToken });
        setPendingInviteToken(null);
      }, 100);
    }
    prevSessionRef.current = session;
  }, [session, pendingInviteToken, setPendingInviteToken]);

  if (loading) return <LoadingScreen />;

  const showFab = session && currentRoute !== 'Feedback' && currentRoute !== 'FeedbackModal';

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={Platform.OS === 'web' ? linking : undefined}
      onStateChange={() => {
        setCurrentRoute(navigationRef.current?.getCurrentRoute()?.name || '');
      }}
    >
      <View style={{ flex: 1 }}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {session ? (
            <>
              <Stack.Screen name="Main" component={MainNavigator} />
              <Stack.Screen name="CreateTrip" component={CreateTripScreen} />
              <Stack.Screen name="EditTrip" component={EditTripScreen} />
              <Stack.Screen name="TripDetail" component={TripDetailScreen} />
              <Stack.Screen name="Itinerary" component={ItineraryScreen} />
              <Stack.Screen name="Map" component={MapScreen} />
              <Stack.Screen name="Photos" component={PhotosScreen} />
              <Stack.Screen name="Budget" component={BudgetScreen} />
              <Stack.Screen name="Packing" component={PackingScreen} />
              <Stack.Screen name="Stops" component={StopsScreen} />
              <Stack.Screen name="EditProfile" component={EditProfileScreen} />
              <Stack.Screen name="Notifications" component={NotificationsScreen} />
              <Stack.Screen name="LanguageCurrency" component={LanguageCurrencyScreen} />
              <Stack.Screen name="AcceptInvite" component={AcceptInviteScreen} />
              <Stack.Screen name="Subscription" component={SubscriptionScreen} />
              <Stack.Screen name="SubscriptionSuccess" component={SubscriptionSuccessScreen} />
              <Stack.Screen name="SubscriptionCancel" component={SubscriptionCancelScreen} />
              <Stack.Screen name="Datenschutz" component={DatenschutzScreen} />
              <Stack.Screen name="AGB" component={AGBScreen} />
              <Stack.Screen name="Impressum" component={ImpressumScreen} />
              <Stack.Screen name="FeedbackModal" component={FeedbackScreen} />
            </>
          ) : (
            <Stack.Screen name="Auth" component={AuthNavigator} />
          )}
          <Stack.Screen name="TripShare" component={TripShareScreen} />
        </Stack.Navigator>
        {showFab && <FloatingFeedbackButton />}
      </View>
    </NavigationContainer>
  );
};
