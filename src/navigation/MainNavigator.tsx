import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeScreen } from '../screens/home/HomeScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { Avatar } from '../components/common';
import { useAuthContext } from '../contexts/AuthContext';
import { getDisplayName } from '../utils/profileHelpers';
import { colors, iconSize } from '../utils/theme';
import { Icon, TAB_ICONS } from '../utils/icons';

const Tab = createBottomTabNavigator();

export const MainNavigator: React.FC = () => {
  const { profile } = useAuthContext();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.secondary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarStyle: { borderTopColor: colors.border, paddingBottom: insets.bottom > 0 ? insets.bottom : 4, height: 65 + (insets.bottom > 0 ? insets.bottom : 4) },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Reisen',
          tabBarIcon: ({ color, focused }) => (
            <Icon name={focused ? TAB_ICONS.homeFilled : TAB_ICONS.home} size={iconSize.md} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profil',
          tabBarIcon: () => (
            <Avatar
              uri={profile?.avatar_url}
              name={profile ? getDisplayName(profile) : ''}
              size={25}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
};
