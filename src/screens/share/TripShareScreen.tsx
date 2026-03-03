import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Image, TouchableOpacity, Linking } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getSharedTrip, ShareTripData } from '../../api/invitations';
import { RootStackParamList } from '../../types/navigation';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { linkifyText } from '../../utils/linkify';
import { formatDateMedium } from '../../utils/dateHelpers';

type Props = NativeStackScreenProps<RootStackParamList, 'TripShare'>;

export const TripShareScreen: React.FC<Props> = ({ route }) => {
  const { token } = route.params;
  const [data, setData] = useState<ShareTripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await getSharedTrip(token);
        setData(result);
      } catch (e: any) {
        setError(e.message || 'Share-Link nicht gefunden oder ungültig.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Reise wird geladen...</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorIcon}>😕</Text>
        <Text style={styles.errorText}>{error || 'Reise nicht gefunden'}</Text>
      </View>
    );
  }

  const { trip, stops, activities, photos, budget, packing, shared_sections, is_authenticated } = data;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {trip.cover_image_url && (
        <Image source={{ uri: trip.cover_image_url }} style={styles.coverImage} />
      )}

      <View style={styles.header}>
        <Text style={styles.title}>{trip.name}</Text>
        <Text style={styles.destination}>{trip.destination}</Text>
        <Text style={styles.dates}>
          {formatDateMedium(trip.start_date)} – {formatDateMedium(trip.end_date)}
        </Text>
      </View>

      {/* Anonymous hint */}
      {!is_authenticated && (
        <View style={styles.authHint}>
          <Text style={styles.authHintText}>
            Melde dich an, um Details wie Aktivitäten, Stopps und Fotos zu sehen.
          </Text>
        </View>
      )}

      {/* Stops */}
      {is_authenticated && shared_sections?.stops && stops.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stopps</Text>
          {stops.map((stop) => (
            <View key={stop.id} style={styles.card}>
              <Text style={styles.cardTitle}>{stop.name}</Text>
              {stop.arrival_date && (
                <Text style={styles.cardSub}>
                  {formatDateMedium(stop.arrival_date)}
                  {stop.departure_date ? ` – ${formatDateMedium(stop.departure_date)}` : ''}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Activities */}
      {is_authenticated && shared_sections?.activities && activities.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Aktivitäten</Text>
          {activities.map((act) => (
            <View key={act.id} style={styles.card}>
              <Text style={styles.cardTitle}>{act.title}</Text>
              <Text style={styles.cardSub}>
                {formatDateMedium(act.date)}
                {act.start_time ? ` · ${act.start_time.slice(0, 5)}` : ''}
                {act.end_time ? ` – ${act.end_time.slice(0, 5)}` : ''}
              </Text>
              {act.location_name && <Text style={styles.cardSub}>{act.location_name}</Text>}
              {act.description && <Text style={styles.cardDesc}>{linkifyText(act.description)}</Text>}
            </View>
          ))}
        </View>
      )}

      {/* Photos */}
      {is_authenticated && shared_sections?.photos && photos.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fotos</Text>
          <View style={styles.photoGrid}>
            {photos.map((photo) => (
              <View key={photo.id} style={styles.photoItem}>
                <Image source={{ uri: photo.thumbnail_url || photo.url }} style={styles.photoImage} />
                {photo.caption && (
                  <Text style={styles.photoCaption} numberOfLines={1}>{photo.caption}</Text>
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Budget */}
      {is_authenticated && shared_sections?.budget && budget && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Budget</Text>
          <View style={styles.budgetTotal}>
            <Text style={styles.budgetTotalLabel}>Gesamtausgaben</Text>
            <Text style={styles.budgetTotalAmount}>
              {budget.currency} {budget.total.toFixed(2)}
            </Text>
          </View>
          {budget.expenses.map((exp, i) => (
            <View key={i} style={styles.card}>
              <View style={styles.expenseRow}>
                <View style={[styles.expenseDot, { backgroundColor: exp.category_color }]} />
                <View style={styles.expenseInfo}>
                  <Text style={styles.cardTitle}>{exp.description}</Text>
                  <Text style={styles.cardSub}>
                    {exp.category_name} · {formatDateMedium(exp.date)}
                  </Text>
                </View>
                <Text style={styles.expenseAmount}>
                  {budget.currency} {exp.amount.toFixed(2)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Packing */}
      {is_authenticated && shared_sections?.packing && packing.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Packliste</Text>
          {packing.map((list, li) => (
            <View key={li} style={styles.packingList}>
              <Text style={styles.packingListName}>{list.name}</Text>
              {list.items.map((item, ii) => (
                <View key={ii} style={styles.packingItem}>
                  <Text style={styles.packingCheck}>{item.is_packed ? '✓' : '○'}</Text>
                  <View style={styles.packingInfo}>
                    <Text style={[styles.packingItemName, item.is_packed && styles.packingItemPacked]}>
                      {item.name}
                    </Text>
                    {item.category && (
                      <Text style={styles.packingCategory}>{item.category}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      <View style={styles.footer}>
        {!is_authenticated ? (
          <>
            <Text style={styles.footerText}>Registriere dich, um alle Details zu sehen</Text>
            <TouchableOpacity onPress={() => Linking.openURL(`https://wayfable.ch/login?redirect=/share/${token}`)}>
              <Text style={styles.footerLink}>wayfable.ch</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.footerText}>Möchtest du mitplanen? Registriere dich auf</Text>
            <TouchableOpacity onPress={() => Linking.openURL(`https://wayfable.ch/login?redirect=/share/${token}`)}>
              <Text style={styles.footerLink}>wayfable.ch</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: spacing.xl },
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md },
  errorIcon: { fontSize: 48, marginBottom: spacing.md },
  errorText: { ...typography.body, color: colors.error, textAlign: 'center' },
  coverImage: { width: '100%', height: 220, resizeMode: 'cover' },
  header: { padding: spacing.xl, alignItems: 'center' },
  title: { ...typography.h1, textAlign: 'center', marginBottom: spacing.xs },
  destination: { ...typography.h3, color: colors.primary, textAlign: 'center' },
  dates: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  // Auth hint
  authHint: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.primary + '10',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  authHintText: { ...typography.bodySmall, color: colors.primary, textAlign: 'center' },
  // Sections
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  sectionTitle: { ...typography.h3, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  cardTitle: { ...typography.body, fontWeight: '600' },
  cardSub: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  cardDesc: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  // Photos
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoItem: { width: '31%', marginBottom: spacing.xs },
  photoImage: { width: '100%', aspectRatio: 1, borderRadius: borderRadius.md, backgroundColor: colors.border },
  photoCaption: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  // Budget
  budgetTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  budgetTotalLabel: { ...typography.body, fontWeight: '600' },
  budgetTotalAmount: { ...typography.h3, color: colors.primary },
  expenseRow: { flexDirection: 'row', alignItems: 'center' },
  expenseDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  expenseInfo: { flex: 1 },
  expenseAmount: { ...typography.body, fontWeight: '600' },
  // Packing
  packingList: { marginBottom: spacing.md },
  packingListName: { ...typography.body, fontWeight: '600', marginBottom: spacing.xs },
  packingItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  packingCheck: { fontSize: 14, width: 24, color: colors.primary },
  packingInfo: { flex: 1 },
  packingItemName: { ...typography.bodySmall },
  packingItemPacked: { textDecorationLine: 'line-through', color: colors.textLight },
  packingCategory: { ...typography.caption, color: colors.textLight },
  // Footer
  footer: { alignItems: 'center', padding: spacing.xl, marginTop: spacing.lg },
  footerText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  footerLink: { ...typography.bodySmall, color: colors.primary, fontWeight: '600', marginTop: spacing.xs },
});
