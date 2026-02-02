import React from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthContext } from '../contexts/AuthContext';
import { LoadingScreen } from '../components/common';
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
import { AcceptInviteScreen } from '../screens/invite/AcceptInviteScreen';
import { RootStackParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking = {
  prefixes: ['https://vacation-planner-gs.netlify.app', 'vacation-planner://'],
  config: {
    screens: {
      AcceptInvite: 'invite/:token',
    },
  },
};

export const AppNavigator: React.FC = () => {
  const { session, loading } = useAuthContext();

  if (loading) return <LoadingScreen />;

  return (
    <NavigationContainer linking={Platform.OS === 'web' ? linking : undefined}>
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
          </>
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
