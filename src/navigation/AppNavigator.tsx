import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthContext } from '../contexts/AuthContext';
import { LoadingScreen } from '../components/common';
import { AuthNavigator } from './AuthNavigator';
import { MainNavigator } from './MainNavigator';
import { CreateTripScreen } from '../screens/trip/CreateTripScreen';
import { TripDetailScreen } from '../screens/trip/TripDetailScreen';
import { ItineraryScreen } from '../screens/trip/ItineraryScreen';
import { MapScreen } from '../screens/trip/MapScreen';
import { PhotosScreen } from '../screens/trip/PhotosScreen';
import { BudgetScreen } from '../screens/trip/BudgetScreen';
import { PackingScreen } from '../screens/trip/PackingScreen';
import { RootStackParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const { session, loading } = useAuthContext();

  if (loading) return <LoadingScreen />;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <>
            <Stack.Screen name="Main" component={MainNavigator} />
            <Stack.Screen name="CreateTrip" component={CreateTripScreen} />
            <Stack.Screen name="TripDetail" component={TripDetailScreen} />
            <Stack.Screen name="Itinerary" component={ItineraryScreen} />
            <Stack.Screen name="Map" component={MapScreen} />
            <Stack.Screen name="Photos" component={PhotosScreen} />
            <Stack.Screen name="Budget" component={BudgetScreen} />
            <Stack.Screen name="Packing" component={PackingScreen} />
          </>
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
