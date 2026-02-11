export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  CreateTrip: undefined;
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
  FeedbackModal: undefined;
  AdminDashboard: undefined;
  AdminUserList: undefined;
  AdminUserDetail: { userId: string };
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
