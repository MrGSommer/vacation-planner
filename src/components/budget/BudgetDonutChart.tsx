import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors, spacing, typography } from '../../utils/theme';

interface CategorySlice {
  name: string;
  color: string;
  spent: number;
}

interface BudgetDonutChartProps {
  categories: CategorySlice[];
  totalSpent: number;
  totalBudget: number;
  currency: string;
}

const SIZE = 110;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const BudgetDonutChart: React.FC<BudgetDonutChartProps> = ({
  categories,
  totalSpent,
  totalBudget,
  currency,
}) => {
  const slices = categories.filter(c => c.spent > 0);
  const total = slices.reduce((s, c) => s + c.spent, 0);

  // Build cumulative offsets
  let offset = 0;
  const arcs = slices.map(slice => {
    const pct = total > 0 ? slice.spent / total : 0;
    const dashLen = pct * CIRCUMFERENCE;
    const arc = { ...slice, dashLen, offset };
    offset += dashLen;
    return arc;
  });

  const pctUsed = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.chartWrap}>
        <Svg width={SIZE} height={SIZE}>
          {/* Background track */}
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={colors.border}
            strokeWidth={STROKE}
          />
          {/* Category arcs */}
          <G rotation="-90" origin={`${SIZE / 2}, ${SIZE / 2}`}>
            {arcs.map((arc, i) => (
              <Circle
                key={i}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={arc.color}
                strokeWidth={STROKE}
                strokeDasharray={`${arc.dashLen} ${CIRCUMFERENCE - arc.dashLen}`}
                strokeDashoffset={-arc.offset}
                strokeLinecap="butt"
              />
            ))}
          </G>
        </Svg>
        {/* Center label */}
        <View style={styles.centerLabel}>
          {totalBudget > 0 ? (
            <>
              <Text style={styles.centerPct}>{pctUsed}%</Text>
              <Text style={styles.centerHint}>genutzt</Text>
            </>
          ) : (
            <>
              <Text style={styles.centerAmount}>{totalSpent.toFixed(0)}</Text>
              <Text style={styles.centerHint}>{currency}</Text>
            </>
          )}
        </View>
      </View>

      {/* Legend */}
      {slices.length > 0 && (
        <View style={styles.legend}>
          {slices.map((s, i) => (
            <View key={i} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: s.color }]} />
              <Text style={styles.legendName} numberOfLines={1}>{s.name}</Text>
              <Text style={styles.legendValue}>{s.spent.toFixed(0)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  chartWrap: { position: 'relative', width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  centerLabel: { position: 'absolute', alignItems: 'center' },
  centerPct: { ...typography.h3, color: colors.text },
  centerAmount: { ...typography.bodySmall, fontWeight: '700', color: colors.text },
  centerHint: { ...typography.caption, color: colors.textSecondary },
  legend: { flex: 1 },
  legendItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.sm },
  legendName: { ...typography.caption, flex: 1, color: colors.text },
  legendValue: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
});
