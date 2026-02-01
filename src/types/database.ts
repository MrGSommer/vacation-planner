export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Trip {
  id: string;
  owner_id: string;
  name: string;
  destination: string;
  destination_lat: number | null;
  destination_lng: number | null;
  cover_image_url: string | null;
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
  created_at: string;
  updated_at: string;
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
  created_at: string;
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
  created_at: string;
}

export interface TripInvitation {
  id: string;
  trip_id: string;
  invited_email: string;
  invited_by: string;
  role: 'editor' | 'viewer';
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
}
