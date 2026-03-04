import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSize } from './theme';

export type IconName = keyof typeof Ionicons.glyphMap;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

/**
 * Thin wrapper around Ionicons for consistent usage.
 * Use this instead of raw emoji characters.
 */
export const Icon: React.FC<IconProps> = ({ name, size = iconSize.md, color = colors.text }) => (
  <Ionicons name={name} size={size} color={color} />
);

// Activity category → Ionicons mapping
export const ACTIVITY_CATEGORY_ICONS: Record<string, IconName> = {
  sightseeing: 'camera-outline',
  food: 'restaurant-outline',
  activity: 'flash-outline',
  transport: 'airplane-outline',
  hotel: 'bed-outline',
  shopping: 'bag-outline',
  relaxation: 'leaf-outline',
  stop: 'pin-outline',
  poll: 'bar-chart-outline',
  other: 'ellipsis-horizontal-circle-outline',
};

// Transport type → Ionicons mapping
export const TRANSPORT_TYPE_ICONS: Record<string, IconName> = {
  'Auto': 'car-outline',
  'Zug': 'train-outline',
  'Bus': 'bus-outline',
  'Flug': 'airplane-outline',
  'Fähre': 'boat-outline',
  'Taxi': 'car-sport-outline',
};

/**
 * Returns the Ionicons name for an activity category,
 * considering transport_type sub-selection.
 */
export const getActivityIconName = (
  category: string,
  categoryData?: Record<string, any> | null
): IconName => {
  if (category === 'transport' && categoryData?.transport_type) {
    return TRANSPORT_TYPE_ICONS[categoryData.transport_type] || 'airplane-outline';
  }
  return ACTIVITY_CATEGORY_ICONS[category] || 'ellipsis-horizontal-circle-outline';
};

// Navigation icons
export const NAV_ICONS = {
  back: 'chevron-back' as IconName,
  forward: 'chevron-forward' as IconName,
  close: 'close' as IconName,
  share: 'share-outline' as IconName,
  delete: 'trash-outline' as IconName,
  edit: 'create-outline' as IconName,
  add: 'add' as IconName,
  search: 'search-outline' as IconName,
  settings: 'settings-outline' as IconName,
  refresh: 'refresh-outline' as IconName,
};

// Tab bar icons
export const TAB_ICONS = {
  home: 'earth-outline' as IconName,
  homeFilled: 'earth' as IconName,
  profile: 'person-outline' as IconName,
  profileFilled: 'person' as IconName,
};

// Trip bottom nav icons
export const TRIP_TAB_ICONS: Record<string, { outline: IconName; filled: IconName }> = {
  TripDetail: { outline: 'grid-outline', filled: 'grid' },
  Itinerary: { outline: 'calendar-outline', filled: 'calendar' },
  Stops: { outline: 'map-outline', filled: 'map' },
  Budget: { outline: 'wallet-outline', filled: 'wallet' },
  Packing: { outline: 'briefcase-outline', filled: 'briefcase' },
};

// Profile screen settings icons
export const SETTINGS_ICONS: Record<string, IconName> = {
  editProfile: 'person-outline',
  notifications: 'notifications-outline',
  language: 'globe-outline',
  fable: 'sparkles-outline',
  admin: 'shield-outline',
  beta: 'flask-outline',
  privacy: 'lock-closed-outline',
  terms: 'document-text-outline',
  impressum: 'information-circle-outline',
};

// Status / misc icons
export const MISC_ICONS = {
  sparkles: 'sparkles' as IconName,
  lock: 'lock-closed-outline' as IconName,
  time: 'time-outline' as IconName,
  location: 'location-outline' as IconName,
  photos: 'images-outline' as IconName,
  calendar: 'calendar-outline' as IconName,
  checkmark: 'checkmark' as IconName,
  expand: 'chevron-down' as IconName,
  collapse: 'chevron-up' as IconName,
  megaphone: 'megaphone-outline' as IconName,
  bell: 'notifications-outline' as IconName,
  folder: 'folder-outline' as IconName,
  fire: 'flame' as IconName,
  rocket: 'rocket' as IconName,
  confetti: 'happy-outline' as IconName,
  globe: 'earth' as IconName,
  link: 'open-outline' as IconName,
};
