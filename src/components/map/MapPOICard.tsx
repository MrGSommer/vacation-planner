import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { Icon } from '../../utils/icons';

/** Map Google Places types to our ACTIVITY_CATEGORIES */
const GOOGLE_TYPE_TO_CATEGORY: Record<string, string> = {
  restaurant: 'food',
  cafe: 'food',
  bar: 'food',
  bakery: 'food',
  meal_delivery: 'food',
  meal_takeaway: 'food',
  food: 'food',
  museum: 'sightseeing',
  art_gallery: 'sightseeing',
  church: 'sightseeing',
  hindu_temple: 'sightseeing',
  mosque: 'sightseeing',
  synagogue: 'sightseeing',
  tourist_attraction: 'sightseeing',
  amusement_park: 'sightseeing',
  zoo: 'sightseeing',
  aquarium: 'sightseeing',
  stadium: 'sightseeing',
  park: 'sightseeing',
  lodging: 'hotel',
  hotel: 'hotel',
  spa: 'relaxation',
  gym: 'relaxation',
  beauty_salon: 'relaxation',
  shopping_mall: 'shopping',
  clothing_store: 'shopping',
  jewelry_store: 'shopping',
  shoe_store: 'shopping',
  store: 'shopping',
  supermarket: 'shopping',
  bus_station: 'transport',
  train_station: 'transport',
  airport: 'transport',
  subway_station: 'transport',
  transit_station: 'transport',
};

const CATEGORY_LABELS: Record<string, string> = {
  food: 'Essen',
  sightseeing: 'Sehenswürdigkeit',
  hotel: 'Unterkunft',
  shopping: 'Einkaufen',
  relaxation: 'Entspannung',
  transport: 'Transport',
  activity: 'Aktivität',
};

const CATEGORY_ICONS: Record<string, string> = {
  food: '🍽️',
  sightseeing: '🏛️',
  hotel: '🏨',
  shopping: '🛍️',
  relaxation: '🧘',
  transport: '✈️',
  activity: '🎯',
};

export interface POIDetails {
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number;
  userRatingCount?: number;
  isOpen?: boolean;
  openingHoursText?: string[];
  photoUrl?: string;
  websiteUrl?: string;
  types?: string[];
  placeId?: string;
}

interface Props {
  poi: POIDetails;
  onAddActivity: () => void;
  onRoutePlanner: () => void;
  onClose: () => void;
}

export function detectCategory(types?: string[]): string {
  if (!types) return 'activity';
  for (const t of types) {
    const cat = GOOGLE_TYPE_TO_CATEGORY[t];
    if (cat) return cat;
  }
  return 'activity';
}

export const MapPOICard: React.FC<Props> = ({ poi, onAddActivity, onRoutePlanner, onClose }) => {
  const category = detectCategory(poi.types);
  const categoryLabel = CATEGORY_LABELS[category] || 'Aktivität';
  const categoryIcon = CATEGORY_ICONS[category] || '📍';
  const [imgError, setImgError] = useState(false);

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
        <Text style={styles.closeBtnText}>✕</Text>
      </TouchableOpacity>

      {/* Photo */}
      {poi.photoUrl && !imgError && (
        <Image
          source={{ uri: poi.photoUrl }}
          style={styles.photo}
          onError={() => setImgError(true)}
          resizeMode="cover"
        />
      )}

      {/* Category badge */}
      <View style={styles.categoryBadge}>
        <Text style={styles.categoryIcon}>{categoryIcon}</Text>
        <Text style={styles.categoryLabel}>{categoryLabel}</Text>
      </View>

      {/* Name */}
      <Text style={styles.name} numberOfLines={2}>{poi.name}</Text>

      {/* Address */}
      <Text style={styles.address} numberOfLines={2}>{poi.address}</Text>

      {/* Rating */}
      {poi.rating != null && (
        <View style={styles.ratingRow}>
          <Text style={styles.ratingStar}>⭐</Text>
          <Text style={styles.ratingText}>{poi.rating.toFixed(1)}</Text>
          {poi.userRatingCount != null && (
            <Text style={styles.ratingCount}>({poi.userRatingCount.toLocaleString('de-CH')})</Text>
          )}
        </View>
      )}

      {/* Opening hours */}
      {poi.isOpen !== undefined && (
        <View style={styles.openRow}>
          <View style={[styles.openDot, { backgroundColor: poi.isOpen ? colors.success : colors.error }]} />
          <Text style={[styles.openText, { color: poi.isOpen ? colors.success : colors.error }]}>
            {poi.isOpen ? 'Jetzt geöffnet' : 'Geschlossen'}
          </Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.addBtn} onPress={onAddActivity}>
          <Icon name="add-circle-outline" size={18} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Als Aktivität hinzufügen</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.routeBtn} onPress={onRoutePlanner}>
          <Icon name="navigate-outline" size={18} color={colors.primary} />
          <Text style={styles.routeBtnText}>Route planen</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    bottom: spacing.xl + 8,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.lg,
    zIndex: 500,
  },
  closeBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  closeBtnText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  photo: {
    width: '100%',
    height: 120,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    marginBottom: spacing.xs,
  },
  categoryIcon: { fontSize: 13, marginRight: 4 },
  categoryLabel: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  name: {
    ...typography.h3,
    paddingRight: 32,
  },
  address: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  ratingStar: { fontSize: 14, marginRight: 4 },
  ratingText: { ...typography.bodySmall, fontWeight: '700', color: colors.text },
  ratingCount: { ...typography.caption, color: colors.textLight, marginLeft: 4 },
  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  openDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  openText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    gap: 6,
  },
  addBtnText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  routeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    gap: 6,
  },
  routeBtnText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.primary,
  },
});
