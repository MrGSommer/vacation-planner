import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { AiTripPlan } from '../../services/ai/planExecutor';
import { colors, spacing, borderRadius, typography, shadows, iconSize } from '../../utils/theme';
import { Icon, getActivityIconName } from '../../utils/icons';
import { InlineEditText } from '../common/InlineEditText';
import { openExternalUrl } from '../../utils/linkify';
import { Button, Card } from '../common';
import { formatDate } from '../../utils/dateHelpers';

interface Props {
  plan: AiTripPlan;
  currency: string;
  onConfirm: (filteredPlan?: AiTripPlan) => void;
  onReject: () => void;
  loading?: boolean;
}

export const AiPlanPreview: React.FC<Props> = ({ plan: initialPlan, currency, onConfirm, onReject, loading }) => {
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [expandedExplain, setExpandedExplain] = useState<string | null>(null); // "dayIdx-actIdx"
  const [selectedDays, setSelectedDays] = useState<Set<number>>(() => new Set(initialPlan.days?.map((_, i) => i) || []));
  const [editedPlan, setEditedPlan] = useState<AiTripPlan>(initialPlan);

  const plan = editedPlan;
  const allSelected = selectedDays.size === (plan.days?.length || 0);

  const toggleDay = useCallback((dayIndex: number) => {
    setSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayIndex)) next.delete(dayIndex);
      else next.add(dayIndex);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedDays(new Set());
    } else {
      setSelectedDays(new Set(plan.days?.map((_, i) => i) || []));
    }
  }, [allSelected, plan.days]);

  const updateActivity = useCallback((dayIndex: number, actIndex: number, field: string, value: string) => {
    setEditedPlan(prev => {
      const days = [...prev.days];
      const activities = [...days[dayIndex].activities];
      activities[actIndex] = { ...activities[actIndex], [field]: value };
      days[dayIndex] = { ...days[dayIndex], activities };
      return { ...prev, days };
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (selectedDays.size === 0) return;
    // Filter plan to only selected days
    if (selectedDays.size === plan.days?.length) {
      onConfirm(editedPlan !== initialPlan ? editedPlan : undefined);
    } else {
      const filteredPlan: AiTripPlan = {
        ...editedPlan,
        days: editedPlan.days.filter((_, i) => selectedDays.has(i)),
      };
      onConfirm(filteredPlan);
    }
  }, [selectedDays, editedPlan, initialPlan, plan.days?.length, onConfirm]);

  const totalActivities = plan.days?.reduce((sum, d) => sum + (d.activities?.length || 0), 0) || 0;
  const totalStops = plan.stops?.length || 0;
  const totalBudget = plan.budget_categories?.reduce((sum, c) => sum + (c.budget_limit || 0), 0) || 0;
  const estimatedCosts = plan.days?.reduce((sum, d) =>
    sum + (d.activities?.reduce((aSum, a) => aSum + (a.cost || 0), 0) || 0), 0) || 0;

  const selectedCount = selectedDays.size;
  const selectedActivities = plan.days?.reduce((sum, d, i) =>
    selectedDays.has(i) ? sum + (d.activities?.length || 0) : sum, 0) || 0;

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
              <Text style={styles.summaryValue}>{selectedCount}/{plan.days?.length || 0}</Text>
              <Text style={styles.summaryLabel}>Tage</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{selectedActivities}</Text>
              <Text style={styles.summaryLabel}>Aktivitäten</Text>
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
          </Card>
        )}

        {/* Select all toggle */}
        {(plan.days?.length || 0) > 1 && (
          <TouchableOpacity style={styles.selectAllRow} onPress={toggleAll} activeOpacity={0.7}>
            <Icon name={allSelected ? 'checkbox' : 'square-outline'} size={iconSize.sm} color={colors.primary} />
            <Text style={styles.selectAllText}>{allSelected ? 'Alle abwählen' : 'Alle auswählen'}</Text>
          </TouchableOpacity>
        )}

        {/* Days */}
        {plan.days?.map((day, dayIndex) => {
          const isSelected = selectedDays.has(dayIndex);
          return (
            <Card key={dayIndex} style={[styles.dayCard, !isSelected && styles.dayCardDeselected] as any}>
              <View style={styles.dayHeaderRow}>
                <TouchableOpacity onPress={() => toggleDay(dayIndex)} style={styles.checkbox}>
                  <Icon
                    name={isSelected ? 'checkbox' : 'square-outline'}
                    size={iconSize.sm}
                    color={isSelected ? colors.primary : colors.textLight}
                  />
                </TouchableOpacity>
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
              </View>

              {expandedDay === dayIndex && day.activities?.map((act, actIndex) => (
                <View key={actIndex} style={styles.activityRow}>
                  <View style={styles.activityIcon}>
                    <Icon name={getActivityIconName(act.category, act.category_data)} size={iconSize.sm} color={colors.textSecondary} />
                  </View>
                  <View style={styles.activityInfo}>
                    <InlineEditText
                      value={act.title}
                      onSave={(v) => updateActivity(dayIndex, actIndex, 'title', v)}
                      style={styles.activityTitle}
                      maxLength={100}
                    />
                    <View style={styles.activityMeta}>
                      {act.start_time && (
                        <InlineEditText
                          value={act.start_time + (act.end_time ? ` - ${act.end_time}` : '')}
                          onSave={(v) => {
                            const parts = v.split(' - ');
                            updateActivity(dayIndex, actIndex, 'start_time', parts[0]?.trim() || '');
                            if (parts[1]) updateActivity(dayIndex, actIndex, 'end_time', parts[1].trim());
                          }}
                          style={styles.activityTime}
                          maxLength={15}
                        />
                      )}
                      {act.cost != null && act.cost > 0 && (
                        <Text style={styles.activityCost}>~{act.cost} {currency}</Text>
                      )}
                    </View>
                    {act.location_name && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                        <Icon name="location-outline" size={12} color={colors.textSecondary} />
                        <Text style={[styles.activityLocation, { marginTop: 0, marginLeft: 2 }]}>{act.location_name}</Text>
                      </View>
                    )}
                    {act.category_data?.google_maps_url && (
                      <TouchableOpacity onPress={() => openExternalUrl(act.category_data.google_maps_url)}>
                        <Text style={styles.linkText}>Auf Karte anzeigen</Text>
                      </TouchableOpacity>
                    )}
                    {act.category === 'hotel' && act.category_data?.booking_url && (
                      <TouchableOpacity onPress={() => openExternalUrl(act.category_data.booking_url)}>
                        <Text style={styles.linkText}>Hotel suchen</Text>
                      </TouchableOpacity>
                    )}
                    {act.description && (
                      <>
                        <TouchableOpacity
                          style={styles.explainBtn}
                          onPress={() => setExpandedExplain(prev => prev === `${dayIndex}-${actIndex}` ? null : `${dayIndex}-${actIndex}`)}
                          activeOpacity={0.7}
                        >
                          <Icon name="information-circle-outline" size={14} color={colors.secondary} />
                          <Text style={styles.explainBtnText}>Warum?</Text>
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
            </Card>
          );
        })}

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
          title={selectedCount === (plan.days?.length || 0) ? 'Plan übernehmen' : `${selectedCount} Tage übernehmen`}
          onPress={handleConfirm}
          style={styles.actionButton}
          loading={loading}
          disabled={selectedCount === 0}
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
  stopIcon: { marginRight: spacing.sm, justifyContent: 'center' },
  stopInfo: { flex: 1 },
  stopName: { ...typography.body, fontWeight: '600' },
  stopDetail: { ...typography.caption },
  selectAllRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.xs, marginBottom: spacing.xs,
  },
  selectAllText: { ...typography.bodySmall, color: colors.primary, fontWeight: '500' },
  dayCard: { marginBottom: spacing.sm },
  dayCardDeselected: { opacity: 0.5 },
  dayHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  checkbox: { paddingRight: spacing.sm },
  dayHeader: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayTitle: { ...typography.body, fontWeight: '700' },
  dayDate: { ...typography.caption, color: colors.primary },
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
  activityLocation: { ...typography.caption, marginTop: 2 },
  linkText: { ...typography.caption, color: colors.primary, textDecorationLine: 'underline', marginTop: 2 },
  explainBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  explainBtnText: { ...typography.caption, color: colors.secondary, fontWeight: '500' },
  explainBox: { backgroundColor: colors.secondary + '10', borderRadius: borderRadius.sm, padding: spacing.sm, marginTop: 4 },
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
