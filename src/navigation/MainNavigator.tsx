import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { HomeScreen } from '../screens/home/HomeScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { colors } from '../utils/theme';

const Tab = createBottomTabNavigator();

export const MainNavigator: React.FC = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.textLight,
      tabBarStyle: { borderTopColor: colors.border, paddingBottom: 4, height: 56 },
      tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
    }}
  >
    <Tab.Screen
      name="Home"
      component={HomeScreen}
      options={{
        tabBarLabel: 'Reisen',
        tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🌍</Text>,
      }}
    />
    <Tab.Screen
      name="Profile"
      component={ProfileScreen}
      options={{
        tabBarLabel: 'Profil',
        tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👤</Text>,
      }}
    />
  </Tab.Navigator>
);
