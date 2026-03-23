import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { NavigationContainer, NavigationContainerRef, getStateFromPath as defaultGetStateFromPath } from '@react-navigation/native';
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
import { FableSettingsScreen } from '../screens/profile/FableSettingsScreen';
import { FableTripSettingsScreen } from '../screens/trip/FableTripSettingsScreen';
import { AcceptInviteScreen } from '../screens/invite/AcceptInviteScreen';
import { TripShareScreen } from '../screens/share/TripShareScreen';
import { SubscriptionScreen } from '../screens/subscription/SubscriptionScreen';
import { SubscriptionSuccessScreen } from '../screens/subscription/SubscriptionSuccessScreen';
import { SubscriptionCancelScreen } from '../screens/subscription/SubscriptionCancelScreen';
import { DatenschutzScreen } from '../screens/legal/DatenschutzScreen';
import { AGBScreen } from '../screens/legal/AGBScreen';
import { ImpressumScreen } from '../screens/legal/ImpressumScreen';
import { AdminDashboardScreen } from '../screens/admin/AdminDashboardScreen';
import { BetaDashboardScreen } from '../screens/admin/BetaDashboardScreen';
import { AdminUserListScreen } from '../screens/admin/AdminUserListScreen';
import { AdminUserDetailScreen } from '../screens/admin/AdminUserDetailScreen';
import { AdminEmailTestScreen } from '../screens/admin/AdminEmailTestScreen';
import { AdminAnnouncementsScreen } from '../screens/admin/AdminAnnouncementsScreen';
import { ResetPasswordScreen } from '../screens/auth/ResetPasswordScreen';
import { CardSetupScreen } from '../screens/auth/CardSetupScreen';
import { SupportChatScreen } from '../screens/profile/SupportChatScreen';
import { SlideshowViewScreen } from '../screens/slideshow/SlideshowViewScreen';
import { TrialExpiredModal } from '../components/common/TrialExpiredModal';
import { AnnouncementModal } from '../components/common/AnnouncementModal';
import { PlanGenerationBar } from '../components/common/PlanGenerationBar';
import { CommandPalette } from '../components/common/CommandPalette';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { RootStackParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Shared screens config — routes that exist regardless of auth state
const SHARED_SCREENS = {
  AcceptInvite: 'invite/:token',
  TripShare: 'share/:token',
  SlideshowView: 'slideshow/:token',
  Datenschutz: 'datenschutz',
  AGB: 'agb',
  Impressum: 'impressum',
  ResetPassword: 'reset-password',
} as const;

// Authenticated-only screens config
const AUTH_SCREENS = {
  Main: { screens: { Home: '', Profile: 'profile' } },
  SubscriptionSuccess: 'subscription-success',
  SubscriptionCancel: 'subscription-cancel',
  TripDetail: {
    path: 'trip/:tripId',
    parse: { tripId: String, openFable: (v: string) => v === 'true' },
  },
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
  FableSettings: 'settings/fable',
  FableTripSettings: 'trip/:tripId/fable-settings',
  Subscription: 'subscription',
  FeedbackModal: 'feedback',
  SupportChat: 'support',
  AdminDashboard: 'admin',
  BetaDashboard: 'admin/beta',
  AdminUserList: 'admin/users',
  AdminUserDetail: 'admin/users/:userId',
  AdminEmailTest: 'admin/email-test',
  AdminAnnouncements: 'admin/announcements',
} as const;

// Unauthenticated screens config
const UNAUTH_SCREENS = {
  Auth: { screens: { Welcome: '' } },
} as const;

function buildLinking(isAuthenticated: boolean) {
  return {
    prefixes: ['https://wayfable.ch', 'wayfable://'],
    config: {
      screens: {
        ...(isAuthenticated ? AUTH_SCREENS : UNAUTH_SCREENS),
        ...SHARED_SCREENS,
      },
    },
    getStateFromPath: (path: string, options: any) => {
      try {
        return defaultGetStateFromPath(path, options);
      } catch (e) {
        console.warn('getStateFromPath failed for', path, e);
        return undefined;
      }
    },
  };
}

export const AppNavigator: React.FC = () => {
  const { session, loading, profile, pendingInviteToken, setPendingInviteToken, pendingRedirectPath, setPendingRedirectPath, passwordRecovery, clearPasswordRecovery, pendingSetPassword, clearPendingSetPassword } = useAuthContext();
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const prevSessionRef = useRef(session);
  // Capture the initial URL before React Navigation overwrites it on route resolution
  const initialPathRef = useRef(Platform.OS === 'web' ? window.location.pathname + window.location.search : '');
  const linking = useMemo(() => buildLinking(!!session), [!!session]);
  const [currentRoute, setCurrentRoute] = useState('');
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // Global keyboard shortcuts (web only)
  useKeyboardShortcuts([
    { key: 'k', cmdOrCtrl: true, handler: () => setShowCommandPalette(v => !v) },
  ]);

  // Extract invite token or deep link path from the ORIGINAL URL (captured before
  // React Navigation can overwrite it during route resolution)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const fullPath = initialPathRef.current;
    const path = fullPath.split('?')[0];
    const search = fullPath.includes('?') ? fullPath.slice(fullPath.indexOf('?')) : '';

    // Invite token: ALWAYS capture (even when authenticated) so post-login redirect works
    const inviteMatch = path.match(/^\/invite\/(.+)$/);
    if (inviteMatch) {
      setPendingInviteToken(inviteMatch[1]);
      // Route is now in SHARED_SCREENS — React Navigation handles navigation
      return;
    }

    // For other paths, only process when unauthenticated
    if (session) return;

    if (path.match(/^\/slideshow\/.+$/) || path.match(/^\/share\/.+$/) || path.match(/^\/invite\/.+$/)) {
      // Slideshow + share are public — don't require auth, let linking handle it
      return;
    } else if (path && path !== '/' && path !== '/login' && path !== '/register') {
      // Save any deep link path for redirect after login (including /trip/... from email notifications)
      setPendingRedirectPath(path);
    } else {
      // Check for ?redirect= query param (e.g. /login?redirect=/share/token)
      const params = new URLSearchParams(search);
      const redirect = params.get('redirect');
      if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
        setPendingRedirectPath(redirect);
      }
    }
  }, [session, setPendingInviteToken, setPendingRedirectPath]);

  // Invite token redirect: fires whenever session + token are both present
  // Handles both same-page login AND auth-redirect page reloads (OAuth, email confirm)
  useEffect(() => {
    if (!session || !pendingInviteToken) return;
    const attemptRedirect = (retries = 0) => {
      if (retries > 20) {
        setPendingInviteToken(null);
        return;
      }
      if (!navigationRef.current?.getRootState()?.routes) {
        setTimeout(() => attemptRedirect(retries + 1), 100);
        return;
      }
      navigationRef.current?.navigate('AcceptInvite', { token: pendingInviteToken });
      setPendingInviteToken(null);
    };
    setTimeout(() => attemptRedirect(), 200);
  }, [session, pendingInviteToken, setPendingInviteToken]);

  // After login: redirect to pending path (non-invite deep links)
  useEffect(() => {
    if (!prevSessionRef.current && session) {
      setTimeout(() => {
        if (pendingRedirectPath) {
          const path = pendingRedirectPath;
          setPendingRedirectPath(null);
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', path);
            const attemptRedirect = (retries = 0) => {
              if (retries > 20) return;
              if (!navigationRef.current?.getRootState()?.routes) {
                setTimeout(() => attemptRedirect(retries + 1), 100);
                return;
              }
              window.dispatchEvent(new PopStateEvent('popstate'));
            };
            attemptRedirect();
          }
        }
      }, 100);
    }
    prevSessionRef.current = session;
  }, [session, pendingRedirectPath, setPendingRedirectPath]);

  // PASSWORD_RECOVERY event → navigate to ResetPassword screen
  useEffect(() => {
    if (session && passwordRecovery) {
      setTimeout(() => {
        navigationRef.current?.navigate('ResetPassword');
        clearPasswordRecovery();
      }, 100);
    }
  }, [session, passwordRecovery, clearPasswordRecovery]);

  // Dashboard invite (type=invite) → user needs to set password
  useEffect(() => {
    if (session && pendingSetPassword) {
      setTimeout(() => {
        navigationRef.current?.navigate('ResetPassword');
        clearPendingSetPassword();
      }, 100);
    }
  }, [session, pendingSetPassword, clearPendingSetPassword]);

  // New trialing user without Stripe customer → show card setup
  const cardSetupShownRef = useRef(false);
  useEffect(() => {
    if (!session || !profile || cardSetupShownRef.current) return;
    if (
      profile.subscription_status === 'trialing' &&
      !profile.stripe_customer_id &&
      !pendingInviteToken &&
      !pendingRedirectPath &&
      !passwordRecovery
    ) {
      cardSetupShownRef.current = true;
      setTimeout(() => {
        navigationRef.current?.navigate('CardSetup');
      }, 300);
    }
  }, [session, profile, pendingInviteToken, pendingRedirectPath, passwordRecovery]);

  if (loading) return <LoadingScreen />;

  const showFab = session && currentRoute !== 'Feedback' && currentRoute !== 'FeedbackModal' && currentRoute !== 'SupportChat';

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={Platform.OS === 'web' ? linking : undefined}
      onStateChange={() => {
        setCurrentRoute(navigationRef.current?.getCurrentRoute()?.name || '');
      }}
    >
      <View style={{ flex: 1 }}>
        {session && <PlanGenerationBar />}
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', animationDuration: 250 }}>
          {session ? (
            <>
              <Stack.Screen name="Main" component={MainNavigator} options={{ animation: 'none' }} />
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
              <Stack.Screen name="FableSettings" component={FableSettingsScreen} />
              <Stack.Screen name="FableTripSettings" component={FableTripSettingsScreen} />
              <Stack.Screen name="Subscription" component={SubscriptionScreen} />
              <Stack.Screen name="SubscriptionSuccess" component={SubscriptionSuccessScreen} />
              <Stack.Screen name="SubscriptionCancel" component={SubscriptionCancelScreen} />
              <Stack.Screen name="Datenschutz" component={DatenschutzScreen} />
              <Stack.Screen name="AGB" component={AGBScreen} />
              <Stack.Screen name="Impressum" component={ImpressumScreen} />
              <Stack.Screen name="FeedbackModal" component={FeedbackScreen} />
              <Stack.Screen name="SupportChat" component={SupportChatScreen} />
              <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
              <Stack.Screen name="BetaDashboard" component={BetaDashboardScreen} />
              <Stack.Screen name="AdminUserList" component={AdminUserListScreen} />
              <Stack.Screen name="AdminUserDetail" component={AdminUserDetailScreen} />
              <Stack.Screen name="AdminEmailTest" component={AdminEmailTestScreen} />
              <Stack.Screen name="AdminAnnouncements" component={AdminAnnouncementsScreen} />
              <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
              <Stack.Screen name="CardSetup" component={CardSetupScreen} />
            </>
          ) : (
            <Stack.Screen name="Auth" component={AuthNavigator} />
          )}
          <Stack.Screen name="AcceptInvite" component={AcceptInviteScreen} />
          <Stack.Screen name="TripShare" component={TripShareScreen} />
          <Stack.Screen name="SlideshowView" component={SlideshowViewScreen} />
        </Stack.Navigator>
        {showFab && <FloatingFeedbackButton />}
        {session && <AnnouncementModal />}
        {session && <TrialExpiredModal />}
        {session && <CommandPalette visible={showCommandPalette} onClose={() => setShowCommandPalette(false)} />}
      </View>
    </NavigationContainer>
  );
};
