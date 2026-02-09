import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { getTrip } from '../../api/trips';
import { getDays, getActivities } from '../../api/itineraries';
import { getStops } from '../../api/stops';
import { getBudgetCategories } from '../../api/budgets';
import { getPackingLists, getPackingItems } from '../../api/packing';
import { printTripHtml, PrintData, PrintOptions } from '../../utils/printHelper';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../common';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

interface Props {
  tripId: string;
  tripName: string;
}

const OPTION_LABELS: Record<keyof PrintOptions, string> = {
  itinerary: 'Tagesplan',
  stops: 'Stops & Route',
  budget: 'Budget',
  packing: 'Packliste',
  notes: 'Notizen',
};

export const TripPrintTab: React.FC<Props> = ({ tripId, tripName }) => {
  const { showToast } = useToast();
  const [options, setOptions] = useState<PrintOptions>({
    itinerary: true,
    stops: true,
    budget: true,
    packing: true,
    notes: true,
  });
  const [loading, setLoading] = useState(false);

  const toggleOption = (key: keyof PrintOptions) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePrint = async () => {
    if (Platform.OS !== 'web') {
      showToast('Drucken ist nur im Browser verfuegbar', 'error');
      return;
    }

    setLoading(true);
    try {
      const trip = await getTrip(tripId);

      // Load data based on selected options
      const [daysData, stopsData, budgetData, packingLists] = await Promise.all([
        options.itinerary ? getDays(tripId) : Promise.resolve([]),
        options.stops ? getStops(tripId) : Promise.resolve([]),
        options.budget ? getBudgetCategories(tripId) : Promise.resolve([]),
        options.packing ? getPackingLists(tripId) : Promise.resolve([]),
      ]);

      // Load activities for each day
      const daysWithActivities = await Promise.all(
        daysData.map(async (day) => {
          const activities = await getActivities(day.id);
          return { ...day, activities };
        }),
      );

      // Load packing items from all lists
      let allPackingItems: any[] = [];
      if (options.packing && packingLists.length > 0) {
        const itemArrays = await Promise.all(
          packingLists.map(list => getPackingItems(list.id)),
        );
        allPackingItems = itemArrays.flat();
      }

      const printData: PrintData = {
        trip,
        days: daysWithActivities,
        stops: stopsData,
        budgetCategories: budgetData,
        packingItems: allPackingItems,
      };

      printTripHtml(printData, options);
    } catch (e) {
      showToast('Fehler beim Laden der Daten', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>Was soll gedruckt werden?</Text>

      {(Object.keys(OPTION_LABELS) as (keyof PrintOptions)[]).map(key => (
        <TouchableOpacity
          key={key}
          style={styles.optionRow}
          onPress={() => toggleOption(key)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, options[key] && styles.checkboxChecked]}>
            {options[key] && <Text style={styles.checkmark}>{'✓'}</Text>}
          </View>
          <Text style={styles.optionLabel}>{OPTION_LABELS[key]}</Text>
        </TouchableOpacity>
      ))}

      <Button
        title="Reiseplan drucken"
        onPress={handlePrint}
        loading={loading}
        style={styles.printBtn}
      />

      {Platform.OS !== 'web' && (
        <Text style={styles.hint}>Drucken ist nur in der Web-Version verfuegbar.</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  sectionTitle: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md, marginTop: spacing.md },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  optionLabel: { ...typography.body },
  printBtn: { marginTop: spacing.lg },
  hint: { ...typography.caption, color: colors.textLight, textAlign: 'center', marginTop: spacing.md },
});
