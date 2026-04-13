import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AiTripPlan } from '../../services/ai/planExecutor';
import { colors, spacing, borderRadius, typography, shadows, iconSize, gradients } from '../../utils/theme';
import { Icon, getActivityIconName } from '../../utils/icons';
import { formatDate } from '../../utils/dateHelpers';

interface LandingPlanPreviewProps {
  plan: AiTripPlan;
  onAction: () => void;
  onRegenerate: () => void;
  regenerating?: boolean;
  isMobile?: boolean;
  previewHint?: string | null;
}

export const LandingPlanPreview: React.FC<LandingPlanPreviewProps> = ({
  plan, onAction, onRegenerate, regenerating, isMobile = false, previewHint,
}) => {
  const [expandedDay, setExpandedDay] = useState<number | null>(0); // First day expanded by default
  const [expandedExplain, setExpandedExplain] = useState<string | null>(null);

  const totalActivities = plan.days?.reduce((sum, d) => sum + (d.activities?.length || 0), 0) || 0;
  const totalStops = plan.stops?.length || 0;
  const estimatedCosts = plan.days?.reduce((sum, d) =>
    sum + (d.activities?.reduce((aSum, a) => aSum + (a.cost || 0), 0) || 0), 0) || 0;
  const totalBudget = plan.budget_categories?.reduce((sum, c) => sum + (c.budget_limit || 0), 0) || 0;

  return (
    <View style={styles.container}>
      {/* Trip Name */}
      {plan.trip && (
        <Text style={[styles.tripName, isMobile && { fontSize: 22 }]}>{plan.trip.name}</Text>
      )}
      {plan.trip && (
        <Text style={styles.tripDestination}>
          <Icon name="location-outline" size={14} color={colors.secondary} /> {plan.trip.destination}
          {plan.trip.start_date && plan.trip.end_date && (
            ` · ${formatDate(plan.trip.start_date)} – ${formatDate(plan.trip.end_date)}`
          )}
        </Text>
      )}
      {previewHint && (
        <Text style={styles.hintText}>
          Das sind erst die ersten Tage — der volle Plan wartet auf dich!
        </Text>
      )}

      {/* Summary */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{plan.days?.length || 0}</Text>
          <Text style={styles.summaryLabel}>Tage</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{totalActivities}</Text>
          <Text style={styles.summaryLabel}>Aktivitäten</Text>
        </View>
        {totalStops > 0 && (
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{totalStops}</Text>
            <Text style={styles.summaryLabel}>Stops</Text>
          </View>
        )}
        {estimatedCosts > 0 && (
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>~{estimatedCosts.toFixed(0)}</Text>
            <Text style={styles.summaryLabel}>CHF</Text>
          </View>
        )}
      </View>

      {/* Stops */}
      {plan.stops && plan.stops.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            <Icon name="map-outline" size={16} color={colors.secondary} /> Route
          </Text>
          {plan.stops.map((stop, i) => (
            <View key={i} style={styles.stopRow}>
              <View style={styles.stopIcon}>
                <Icon name={stop.type === 'overnight' ? 'bed-outline' : 'pin-outline'} size={iconSize.sm} color={colors.textSecondary} />
              </View>
              <View style={styles.stopInfo}>
                <Text style={styles.stopName}>{stop.name}</Text>
                {stop.nights ? (
                  <Text style={styles.stopDetail}>{stop.nights} {stop.nights === 1 ? 'Nacht' : 'Nächte'}</Text>
                ) : (
                  <Text style={styles.stopDetail}>Zwischenstopp</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Days */}
      {plan.days?.map((day, dayIndex) => (
        <View key={dayIndex} style={styles.dayCard}>
          <TouchableOpacity
            onPress={() => setExpandedDay(expandedDay === dayIndex ? null : dayIndex)}
            style={styles.dayHeader}
            activeOpacity={0.7}
          >
            <View>
              <Text style={styles.dayTitle}>Tag {dayIndex + 1}</Text>
              <Text style={styles.dayDate}>{formatDate(day.date)}</Text>
            </View>
            <View style={styles.dayMeta}>
              <Text style={styles.dayActivityCount}>{day.activities?.length || 0} Aktivitäten</Text>
              <Icon name={expandedDay === dayIndex ? 'chevron-up' : 'chevron-down'} size={iconSize.xs} color={colors.textLight} />
            </View>
          </TouchableOpacity>

          {expandedDay === dayIndex && day.activities?.map((act, actIndex) => (
            <View key={actIndex} style={styles.activityRow}>
              <View style={styles.activityIcon}>
                <Icon name={getActivityIconName(act.category, act.category_data)} size={iconSize.sm} color={colors.textSecondary} />
              </View>
              <View style={styles.activityInfo}>
                <Text style={styles.activityTitle}>{act.title}</Text>
                <View style={styles.activityMeta}>
                  {act.start_time && (
                    <Text style={styles.activityTime}>
                      {act.start_time}{act.end_time ? ` - ${act.end_time}` : ''}
                    </Text>
                  )}
                  {act.cost != null && act.cost > 0 && (
                    <Text style={styles.activityCost}>~{act.cost} CHF</Text>
                  )}
                </View>
                {act.location_name && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                    <Icon name="location-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.activityLocation}>{act.location_name}</Text>
                  </View>
                )}
                {act.description && (
                  <>
                    <TouchableOpacity
                      style={styles.explainBtn}
                      onPress={() => setExpandedExplain(prev => prev === `${dayIndex}-${actIndex}` ? null : `${dayIndex}-${actIndex}`)}
                      activeOpacity={0.7}
                    >
                      <Icon name="information-circle-outline" size={14} color={colors.secondary} />
                      <Text style={styles.explainBtnText}>Details</Text>
                    </TouchableOpacity>
                    {expandedExplain === `${dayIndex}-${actIndex}` && (
                      <View style={styles.explainBox}>
                        <Text style={styles.explainText}>{act.description}</Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            </View>
          ))}
        </View>
      ))}

      {/* Budget categories */}
      {plan.budget_categories && plan.budget_categories.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            <Icon name="wallet-outline" size={16} color={colors.secondary} /> Budget-Übersicht
          </Text>
          {plan.budget_categories.map((cat, i) => (
            <View key={i} style={styles.budgetRow}>
              <View style={[styles.budgetDot, { backgroundColor: cat.color }]} />
              <Text style={styles.budgetName}>{cat.name}</Text>
              {cat.budget_limit != null && (
                <Text style={styles.budgetLimit}>{cat.budget_limit} CHF</Text>
              )}
            </View>
          ))}
          {totalBudget > 0 && (
            <View style={styles.budgetTotal}>
              <Text style={styles.budgetTotalLabel}>Geschätztes Gesamt-Budget</Text>
              <Text style={styles.budgetTotalValue}>{totalBudget} CHF</Text>
            </View>
          )}
        </View>
      )}

      {/* CTA Banner */}
      <View style={styles.ctaBanner}>
        <LinearGradient
          colors={[`${colors.secondary}08`, `${colors.secondary}15`]}
          style={styles.ctaGradient}
        >
          <Icon name="sparkles-outline" size={24} color={colors.secondary} />
          <Text style={styles.ctaText}>
            Plan bearbeiten, speichern oder mit Freunden teilen
          </Text>

          {/* Primary CTA */}
          <TouchableOpacity onPress={onAction} activeOpacity={0.8}>
            <LinearGradient
              colors={[colors.secondary, colors.sky]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.ctaButton}
            >
              <Text style={styles.ctaButtonText}>Plan speichern & bearbeiten</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Secondary CTA */}
          <TouchableOpacity onPress={onAction} style={styles.ctaSecondary} activeOpacity={0.7}>
            <Icon name="download-outline" size={16} color={colors.secondary} />
            <Text style={styles.ctaSecondaryText}>Exportieren / Drucken</Text>
          </TouchableOpacity>

          {/* Regenerate */}
          <TouchableOpacity onPress={onRegenerate} style={styles.ctaGhost} activeOpacity={0.7} disabled={regenerating}>
            <Icon name="refresh-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.ctaGhostText}>{regenerating ? 'Wird generiert...' : 'Anderen Plan generieren'}</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
  },
  tripName: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  tripDestination: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  summaryItem: { alignItems: 'center' },
  summaryValue: { fontSize: 24, fontWeight: '800', color: colors.secondary },
  summaryLabel: { ...typography.caption, marginTop: 2 },

  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.sm,
    color: colors.text,
  },

  stopRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  stopIcon: { marginRight: spacing.sm, justifyContent: 'center' },
  stopInfo: { flex: 1 },
  stopName: { ...typography.body, fontWeight: '600' },
  stopDetail: { ...typography.caption, color: colors.textSecondary },

  dayCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayTitle: { ...typography.body, fontWeight: '700' },
  dayDate: { ...typography.caption, color: colors.secondary },
  dayMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dayActivityCount: { ...typography.caption },

  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  activityIcon: { marginRight: spacing.sm, marginTop: 2, justifyContent: 'center' },
  activityInfo: { flex: 1 },
  activityTitle: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  activityMeta: { flexDirection: 'row', gap: spacing.md, marginTop: 2 },
  activityTime: { ...typography.caption, color: colors.secondary },
  activityCost: { ...typography.caption, color: colors.primary },
  activityLocation: { ...typography.caption, marginLeft: 2 },

  explainBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  explainBtnText: { ...typography.caption, color: colors.secondary, fontWeight: '500' },
  explainBox: {
    backgroundColor: colors.secondary + '10',
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginTop: 4,
  },
  explainText: { ...typography.caption, color: colors.text, lineHeight: 18 },

  budgetRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  budgetDot: { width: 12, height: 12, borderRadius: 6, marginRight: spacing.sm },
  budgetName: { ...typography.body, flex: 1 },
  budgetLimit: { ...typography.bodySmall, color: colors.textSecondary },
  budgetTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  budgetTotalLabel: { ...typography.body, fontWeight: '700' },
  budgetTotalValue: { ...typography.body, fontWeight: '700', color: colors.secondary },

  hintText: {
    ...typography.bodySmall,
    color: colors.secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    fontStyle: 'italic',
    opacity: 0.85,
  },

  ctaBanner: {
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  ctaGradient: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${colors.secondary}20`,
  },
  ctaText: {
    ...typography.body,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    fontWeight: '500',
  },
  ctaButton: {
    paddingHorizontal: spacing.xl + spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
  },
  ctaButtonText: {
    ...typography.button,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  ctaSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.secondary,
  },
  ctaSecondaryText: {
    ...typography.bodySmall,
    color: colors.secondary,
    fontWeight: '600',
  },
  ctaGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
  },
  ctaGhostText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});
