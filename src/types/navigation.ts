export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  CreateTrip: { openFable?: boolean } | undefined;
  EditTrip: { tripId: string };
  TripDetail: { tripId: string };
  Itinerary: { tripId: string };
  Map: { tripId: string };
  Photos: { tripId: string };
  Budget: { tripId: string };
  Packing: { tripId: string };
  Stops: { tripId: string };
  EditProfile: undefined;
  Notifications: undefined;
  LanguageCurrency: undefined;
  AcceptInvite: { token: string };
  TripShare: { token: string };
  Subscription: undefined;
  SubscriptionSuccess: undefined;
  SubscriptionCancel: undefined;
  Datenschutz: undefined;
  AGB: undefined;
  Impressum: undefined;
  FableSettings: undefined;
  FableTripSettings: { tripId: string };
  FeedbackModal: {
    prefillType?: 'bug' | 'feature' | 'feedback' | 'question';
    prefillDescription?: string;
    supportConversationId?: string;
  } | undefined;
  SupportChat: { initialQuestion?: string } | undefined;
  AdminDashboard: undefined;
  AdminUserList: undefined;
  AdminUserDetail: { userId: string };
  AdminEmailTest: undefined;
  AdminAnnouncements: undefined;
  BetaDashboard: undefined;
  ResetPassword: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Profile: undefined;
};

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  SignUp: undefined;
  SignUpSuccess: { email: string };
};
