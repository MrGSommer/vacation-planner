import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { WelcomeScreen } from '../screens/auth/WelcomeScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { SignUpScreen } from '../screens/auth/SignUpScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { SignUpSuccessScreen } from '../screens/auth/SignUpSuccessScreen';
import { DatenschutzScreen } from '../screens/legal/DatenschutzScreen';
import { AGBScreen } from '../screens/legal/AGBScreen';
import { ImpressumScreen } from '../screens/legal/ImpressumScreen';

const Stack = createNativeStackNavigator();

export const AuthNavigator: React.FC = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Welcome" component={WelcomeScreen} />
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="SignUp" component={SignUpScreen} />
    <Stack.Screen name="SignUpSuccess" component={SignUpSuccessScreen} />
    <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    <Stack.Screen name="Datenschutz" component={DatenschutzScreen} />
    <Stack.Screen name="AGB" component={AGBScreen} />
    <Stack.Screen name="Impressum" component={ImpressumScreen} />
  </Stack.Navigator>
);
