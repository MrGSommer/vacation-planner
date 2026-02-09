export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  preferred_language: string;
  preferred_currency: string;
  notifications_enabled: boolean;
  ai_trip_context_enabled: boolean;
  subscription_tier: 'free' | 'premium';
  subscription_status: 'active' | 'canceled' | 'past_due' | 'trialing';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_period_end: string | null;
  ai_credits_balance: number;
  ai_credits_monthly_quota: number;
  created_at: string;
  updated_at: string;
}

export interface AiUsageLog {
  id: string;
  user_id: string;
  trip_id: string | null;
  task_type: 'conversation' | 'plan_generation';
  credits_charged: number;
  created_at: string;
}

export interface Trip {
  id: string;
  owner_id: string;
  name: string;
  destination: string;
  destination_lat: number | null;
  destination_lng: number | null;
  cover_image_url: string | null;
  cover_image_attribution: string | null;
  start_date: string;
  end_date: string;
  status: 'planning' | 'upcoming' | 'active' | 'completed';
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TripCollaborator {
  id: string;
  trip_id: string;
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
  created_at: string;
}

export interface ItineraryDay {
  id: string;
  trip_id: string;
  date: string;
  notes: string | null;
  created_at: string;
}

export interface Activity {
  id: string;
  day_id: string;
  trip_id: string;
  title: string;
  description: string | null;
  category: string;
  start_time: string | null;
  end_time: string | null;
  location_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_address: string | null;
  cost: number | null;
  currency: string;
  sort_order: number;
  check_in_date: string | null;
  check_out_date: string | null;
  category_data: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ActivityDocument {
  id: string;
  activity_id: string;
  trip_id: string;
  user_id: string;
  storage_path: string;
  url: string;
  file_name: string;
  file_type: string;
  file_size: number | null;
  created_at: string;
}

export interface Photo {
  id: string;
  trip_id: string;
  user_id: string;
  storage_path: string;
  url: string;
  thumbnail_url: string | null;
  caption: string | null;
  taken_at: string | null;
  day_id: string | null;
  created_at: string;
}

export interface BudgetCategory {
  id: string;
  trip_id: string;
  name: string;
  color: string;
  budget_limit: number | null;
  scope: 'group' | 'personal';
  user_id: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  trip_id: string;
  category_id: string;
  user_id: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  scope: 'group' | 'personal';
  paid_by: string | null;
  split_with: string[];
  created_at: string;
  budget_categories?: { name: string; color: string };
}

export interface PackingList {
  id: string;
  trip_id: string;
  name: string;
  created_at: string;
}

export interface PackingItem {
  id: string;
  list_id: string;
  name: string;
  category: string;
  is_packed: boolean;
  quantity: number;
  assigned_to: string | null;
  created_at: string;
}

export interface TripStop {
  id: string;
  trip_id: string;
  name: string;
  place_id: string | null;
  address: string | null;
  lat: number;
  lng: number;
  type: 'overnight' | 'waypoint';
  nights: number | null;
  arrival_date: string | null;
  departure_date: string | null;
  sort_order: number;
  travel_duration_from_prev: number | null;
  travel_distance_from_prev: number | null;
  created_at: string;
}

export interface TripInvitation {
  id: string;
  trip_id: string;
  invited_email: string | null;
  invited_by: string;
  role: 'editor' | 'viewer';
  status: 'pending' | 'accepted' | 'declined';
  token: string;
  type: 'info' | 'collaborate';
  created_at: string;
}
