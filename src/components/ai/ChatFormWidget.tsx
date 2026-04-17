import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, PanResponder, LayoutChangeEvent } from 'react-native';
import { FormWidget, FormSingleSelect, FormMultiSelect, FormSlider } from '../../hooks/useAiPlanner';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

interface ChatFormWidgetProps {
  widget: FormWidget;
  onSubmit: (text: string) => void;
}

function SingleSelectWidget({ widget, onSubmit }: { widget: FormSingleSelect; onSubmit: (text: string) => void }) {
  return (
    <View style={styles.container}>
      {widget.question && <Text style={styles.question}>{widget.question}</Text>}
      <View style={styles.optionsColumn}>
        {widget.options.map((opt, i) => (
          <TouchableOpacity
            key={i}
            style={styles.singleOption}
            onPress={() => onSubmit(opt.label)}
            activeOpacity={0.7}
          >
            <Text style={styles.singleOptionText}>
              {opt.emoji ? `${opt.emoji}  ${opt.label}` : opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function MultiSelectWidget({ widget, onSubmit }: { widget: FormMultiSelect; onSubmit: (text: string) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (label: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        if (widget.max && next.size >= widget.max) return prev;
        next.add(label);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (widget.min && selected.size < widget.min) return;
    if (selected.size === 0) return;
    onSubmit(Array.from(selected).join(', '));
  };

  return (
    <View style={styles.container}>
      {widget.question && <Text style={styles.question}>{widget.question}</Text>}
      <View style={styles.chipsWrap}>
        {widget.options.map((opt, i) => {
          const isSelected = selected.has(opt.label);
          return (
            <TouchableOpacity
              key={i}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => toggle(opt.label)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {opt.emoji ? `${opt.emoji} ${opt.label}` : opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity
        style={[styles.confirmBtn, selected.size === 0 && styles.confirmBtnDisabled]}
        onPress={handleConfirm}
        activeOpacity={0.7}
        disabled={selected.size === 0 || (widget.min ? selected.size < widget.min : false)}
      >
        <Text style={[styles.confirmBtnText, selected.size === 0 && styles.confirmBtnTextDisabled]}>
          {widget.confirm_label || 'Bestätigen'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function SliderWidget({ widget, onSubmit }: { widget: FormSlider; onSubmit: (text: string) => void }) {
  const step = widget.step || 1;
  const [value, setValue] = useState(widget.default_value ?? Math.round((widget.min + widget.max) / 2 / step) * step);
  const trackWidthRef = useRef(0);

  const onLayout = (e: LayoutChangeEvent) => {
    trackWidthRef.current = e.nativeEvent.layout.width;
  };

  const clamp = (v: number) => {
    const snapped = Math.round(v / step) * step;
    return Math.min(widget.max, Math.max(widget.min, snapped));
  };

  const fraction = (value - widget.min) / (widget.max - widget.min);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_, gs) => {
        const x = gs.x0;
        // Approximate position relative to track
        if (trackWidthRef.current > 0) {
          const frac = Math.max(0, Math.min(1, x / trackWidthRef.current));
          setValue(clamp(widget.min + frac * (widget.max - widget.min)));
        }
      },
      onPanResponderMove: (_, gs) => {
        if (trackWidthRef.current > 0) {
          const currentFrac = (value - widget.min) / (widget.max - widget.min);
          const delta = gs.dx / trackWidthRef.current;
          const newFrac = Math.max(0, Math.min(1, currentFrac + delta));
          setValue(clamp(widget.min + newFrac * (widget.max - widget.min)));
        }
      },
    })
  ).current;

  const handleConfirm = () => {
    const text = widget.unit ? `${value} ${widget.unit}` : `${value}`;
    onSubmit(text);
  };

  return (
    <View style={styles.container}>
      {widget.question && <Text style={styles.question}>{widget.question}</Text>}
      <Text style={styles.sliderValue}>
        {value}{widget.unit ? ` ${widget.unit}` : ''}
      </Text>
      <View style={styles.sliderTrack} onLayout={onLayout} {...panResponder.panHandlers}>
        <View style={[styles.sliderFill, { width: `${fraction * 100}%` }]} />
        <View style={[styles.sliderThumb, { left: `${fraction * 100}%` }]} />
      </View>
      {widget.labels && (
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabel}>{widget.labels.min}</Text>
          <Text style={styles.sliderLabel}>{widget.labels.max}</Text>
        </View>
      )}
      <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm} activeOpacity={0.7}>
        <Text style={styles.confirmBtnText}>Bestätigen</Text>
      </TouchableOpacity>
    </View>
  );
}

export function ChatFormWidget({ widget, onSubmit }: ChatFormWidgetProps) {
  // Guard: don't render empty select widgets
  if ((widget.type === 'single_select' || widget.type === 'multi_select') && (!widget.options || widget.options.length === 0)) {
    return null;
  }
  switch (widget.type) {
    case 'single_select':
      return <SingleSelectWidget widget={widget} onSubmit={onSubmit} />;
    case 'multi_select':
      return <MultiSelectWidget widget={widget} onSubmit={onSubmit} />;
    case 'slider':
      return <SliderWidget widget={widget} onSubmit={onSubmit} />;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  question: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  // Single select
  optionsColumn: {
    gap: spacing.sm,
  },
  singleOption: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.secondary,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  singleOptionText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  // Multi select chips
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.secondary,
    backgroundColor: colors.card,
  },
  chipSelected: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  chipText: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.text,
  },
  chipTextSelected: {
    color: '#fff',
  },
  // Confirm button
  confirmBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: spacing.xs,
  },
  confirmBtnDisabled: {
    backgroundColor: colors.border,
  },
  confirmBtnText: {
    ...typography.body,
    fontWeight: '600',
    color: '#fff',
  },
  confirmBtnTextDisabled: {
    color: colors.textLight,
  },
  // Slider
  sliderValue: {
    ...typography.h3,
    color: colors.secondary,
    textAlign: 'center',
  },
  sliderTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    position: 'relative',
    marginVertical: spacing.sm,
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.secondary,
  },
  sliderThumb: {
    position: 'absolute',
    top: -9,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.secondary,
    marginLeft: -12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
