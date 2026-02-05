import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { AiTripPlan } from '../../services/ai/planExecutor';
import { ACTIVITY_CATEGORIES } from '../../utils/constants';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { Button, Card } from '../common';
import { formatDate } from '../../utils/dateHelpers';

interface Props {
  plan: AiTripPlan;
  currency: string;
  onConfirm: () => void;
  onReject: () => void;
  loading?: boolean;
}

const getCategoryIcon = (cat: string) => ACTIVITY_CATEGORIES.find(c => c.id === cat)?.icon || '📌';

export const AiPlanPreview: React.FC<Props> = ({ plan, currency, onConfirm, onReject, loading }) => {
  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  const totalActivities = plan.days?.reduce((sum, d) => sum + (d.activities?.length || 0), 0) || 0;
  const totalStops = plan.stops?.length || 0;
  const totalBudget = plan.budget_categories?.reduce((sum, c) => sum + (c.budget_limit || 0), 0) || 0;
  const estimatedCosts = plan.days?.reduce((sum, d) =>
    sum + (d.activities?.reduce((aSum, a) => aSum + (a.cost || 0), 0) || 0), 0) || 0;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Dein Reiseplan</Text>

        {/* Summary */}
        <Card style={styles.summaryCard}>
          {plan.trip && (
            <Text style={styles.tripName}>{plan.trip.name}</Text>
          )}
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{plan.days?.length || 0}</Text>
              <Text style={styles.summaryLabel}>Tage</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{totalActivities}</Text>
              <Text style={styles.summaryLabel}>Aktivitaeten</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{totalStops}</Text>
              <Text style={styles.summaryLabel}>Stops</Text>
            </View>
            {estimatedCosts > 0 && (
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>~{estimatedCosts.toFixed(0)}</Text>
                <Text style={styles.summaryLabel}>{currency}</Text>
              </View>
            )}
          </View>
        </Card>

        {/* Stops */}
        {plan.stops?.length > 0 && (
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Stops</Text>
            {plan.stops.map((stop, i) => (
              <View key={i} style={styles.stopRow}>
                <Text style={styles.stopIcon}>{stop.type === 'overnight' ? '🏠' : '📍'}</Text>
                <View style={styles.stopInfo}>
                  <Text style={styles.stopName}>{stop.name}</Text>
                  {stop.nights ? (
                    <Text style={styles.stopDetail}>{stop.nights} {stop.nights === 1 ? 'Nacht' : 'Naechte'}</Text>
                  ) : (
                    <Text style={styles.stopDetail}>Zwischenstopp</Text>
                  )}
                </View>
              </View>
            ))}
          </Card>
        )}

        {/* Days */}
        {plan.days?.map((day, dayIndex) => (
          <Card key={dayIndex} style={styles.dayCard}>
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
                <Text style={styles.dayActivityCount}>{day.activities?.length || 0} Aktivitaeten</Text>
                <Text style={styles.expandIcon}>{expandedDay === dayIndex ? '▲' : '▼'}</Text>
              </View>
            </TouchableOpacity>

            {expandedDay === dayIndex && day.activities?.map((act, actIndex) => (
              <View key={actIndex} style={styles.activityRow}>
                <Text style={styles.activityIcon}>{getCategoryIcon(act.category)}</Text>
                <View style={styles.activityInfo}>
                  <Text style={styles.activityTitle}>{act.title}</Text>
                  <View style={styles.activityMeta}>
                    {act.start_time && (
                      <Text style={styles.activityTime}>{act.start_time}{act.end_time ? ` - ${act.end_time}` : ''}</Text>
                    )}
                    {act.cost != null && act.cost > 0 && (
                      <Text style={styles.activityCost}>~{act.cost} {currency}</Text>
                    )}
                  </View>
                  {act.location_name && (
                    <Text style={styles.activityLocation}>📍 {act.location_name}</Text>
                  )}
                </View>
              </View>
            ))}
          </Card>
        ))}

        {/* Budget categories */}
        {plan.budget_categories?.length > 0 && (
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Budget-Kategorien</Text>
            {plan.budget_categories.map((cat, i) => (
              <View key={i} style={styles.budgetRow}>
                <View style={[styles.budgetDot, { backgroundColor: cat.color }]} />
                <Text style={styles.budgetName}>{cat.name}</Text>
                {cat.budget_limit != null && (
                  <Text style={styles.budgetLimit}>{cat.budget_limit} {currency}</Text>
                )}
              </View>
            ))}
            {totalBudget > 0 && (
              <View style={styles.budgetTotal}>
                <Text style={styles.budgetTotalLabel}>Gesamt-Budget</Text>
                <Text style={styles.budgetTotalValue}>{totalBudget} {currency}</Text>
              </View>
            )}
          </Card>
        )}
      </ScrollView>

      {/* Action buttons */}
      <View style={styles.actions}>
        <Button
          title="Nochmal"
          onPress={onReject}
          variant="ghost"
          style={styles.actionButton}
          disabled={loading}
        />
        <Button
          title="Plan uebernehmen"
          onPress={onConfirm}
          style={styles.actionButton}
          loading={loading}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: spacing.xxl },
  title: { ...typography.h2, marginBottom: spacing.md, textAlign: 'center' },
  summaryCard: { marginBottom: spacing.md },
  tripName: { ...typography.h3, marginBottom: spacing.sm, textAlign: 'center' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around' },
  summaryItem: { alignItems: 'center' },
  summaryValue: { ...typography.h2, color: colors.primary },
  summaryLabel: { ...typography.caption, marginTop: 2 },
  sectionCard: { marginBottom: spacing.md },
  sectionTitle: { ...typography.h3, marginBottom: spacing.sm },
  stopRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  stopIcon: { fontSize: 18, marginRight: spacing.sm },
  stopInfo: { flex: 1 },
  stopName: { ...typography.body, fontWeight: '600' },
  stopDetail: { ...typography.caption },
  dayCard: { marginBottom: spacing.sm },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayTitle: { ...typography.body, fontWeight: '700' },
  dayDate: { ...typography.caption, color: colors.primary },
  dayMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dayActivityCount: { ...typography.caption },
  expandIcon: { fontSize: 12, color: colors.textLight },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  activityIcon: { fontSize: 16, marginRight: spacing.sm, marginTop: 2 },
  activityInfo: { flex: 1 },
  activityTitle: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  activityMeta: { flexDirection: 'row', gap: spacing.md, marginTop: 2 },
  activityTime: { ...typography.caption, color: colors.secondary },
  activityCost: { ...typography.caption, color: colors.primary },
  activityLocation: { ...typography.caption, marginTop: 2 },
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
  budgetTotalValue: { ...typography.body, fontWeight: '700', color: colors.primary },
  actions: {
    flexDirection: 'row',
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    gap: spacing.sm,
  },
  actionButton: { flex: 1 },
});
