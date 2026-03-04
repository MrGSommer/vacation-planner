import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, Animated, Platform, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../types/navigation';
import { useTrips } from '../../hooks/useTrips';
import { colors, spacing, borderRadius, typography, shadows, iconSize } from '../../utils/theme';
import { Icon, IconName } from '../../utils/icons';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: IconName;
  section: 'trip' | 'navigate' | 'action';
  onSelect: () => void;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<Props> = ({ visible, onClose }) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { trips } = useTrips();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (visible) {
      setQuery('');
      setSelectedIndex(0);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, damping: 25, stiffness: 400, useNativeDriver: true }),
      ]).start();
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(-20);
    }
  }, [visible, fadeAnim, slideAnim]);

  const allItems: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [];

    // Trips
    trips.forEach(trip => {
      items.push({
        id: `trip-${trip.id}`,
        label: trip.name,
        description: trip.destination,
        icon: 'airplane-outline',
        section: 'trip',
        onSelect: () => { onClose(); navigation.navigate('TripDetail', { tripId: trip.id }); },
      });
    });

    // Navigation items
    const navItems: { label: string; icon: IconName; screen: keyof RootStackParamList }[] = [
      { label: 'Reisen (Home)', icon: 'earth-outline', screen: 'Main' },
      { label: 'Neue Reise erstellen', icon: 'add-circle-outline', screen: 'CreateTrip' },
      { label: 'Profil bearbeiten', icon: 'person-outline', screen: 'EditProfile' },
      { label: 'Benachrichtigungen', icon: 'notifications-outline', screen: 'Notifications' },
      { label: 'Abonnement', icon: 'card-outline', screen: 'Subscription' },
      { label: 'Fable & KI Einstellungen', icon: 'sparkles-outline', screen: 'FableSettings' },
      { label: 'Sprache & Währung', icon: 'globe-outline', screen: 'LanguageCurrency' },
      { label: 'Datenschutz', icon: 'lock-closed-outline', screen: 'Datenschutz' },
      { label: 'AGB', icon: 'document-text-outline', screen: 'AGB' },
      { label: 'Impressum', icon: 'information-circle-outline', screen: 'Impressum' },
      { label: 'Feedback geben', icon: 'chatbubble-outline', screen: 'FeedbackModal' },
      { label: 'Support kontaktieren', icon: 'help-circle-outline', screen: 'SupportChat' },
    ];

    navItems.forEach(item => {
      items.push({
        id: `nav-${item.screen}`,
        label: item.label,
        icon: item.icon,
        section: 'navigate',
        onSelect: () => { onClose(); navigation.navigate(item.screen as any); },
      });
    });

    return items;
  }, [trips, navigation, onClose]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems.slice(0, 12);
    const q = query.toLowerCase();
    return allItems.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q)
    ).slice(0, 12);
  }, [allItems, query]);

  // Reset selection when results change
  useEffect(() => { setSelectedIndex(0); }, [filtered.length]);

  // Keyboard navigation within palette
  const handleKeyDown = useCallback((e: any) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].onSelect();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [filtered, selectedIndex, onClose]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, visible]);

  const sectionLabels: Record<string, string> = {
    trip: 'Reisen',
    navigate: 'Navigation',
    action: 'Aktionen',
  };

  // Group filtered items by section
  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    filtered.forEach(item => {
      const arr = map.get(item.section) || [];
      arr.push(item);
      map.set(item.section, arr);
    });
    return map;
  }, [filtered]);

  let flatIndex = 0;

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={onClose}>
          <Animated.View style={[styles.palette, { transform: [{ translateY: slideAnim }] }]}>
            <TouchableOpacity activeOpacity={1}>
              <View style={styles.searchRow}>
                <Icon name="search-outline" size={iconSize.sm} color={colors.secondary} />
                <TextInput
                  ref={inputRef}
                  style={styles.searchInput}
                  placeholder="Reise suchen, navigieren..."
                  placeholderTextColor={colors.textLight}
                  value={query}
                  onChangeText={setQuery}
                  autoFocus
                />
                <TouchableOpacity onPress={onClose} style={styles.escBadge}>
                  <Text style={styles.escText}>ESC</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
                {filtered.length === 0 ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyText}>Keine Ergebnisse</Text>
                  </View>
                ) : (
                  Array.from(grouped.entries()).map(([section, items]) => (
                    <View key={section}>
                      <Text style={styles.sectionLabel}>{sectionLabels[section] || section}</Text>
                      {items.map(item => {
                        const idx = flatIndex++;
                        const isSelected = idx === selectedIndex;
                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={[styles.resultItem, isSelected && styles.resultItemSelected]}
                            onPress={item.onSelect}
                            activeOpacity={0.7}
                          >
                            <Icon name={item.icon} size={iconSize.sm} color={isSelected ? colors.primary : colors.textSecondary} />
                            <View style={styles.resultText}>
                              <Text style={[styles.resultLabel, isSelected && styles.resultLabelSelected]} numberOfLines={1}>
                                {item.label}
                              </Text>
                              {item.description && (
                                <Text style={styles.resultDesc} numberOfLines={1}>{item.description}</Text>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))
                )}
              </ScrollView>

              <View style={styles.footer}>
                <Text style={styles.footerText}>↑↓ navigieren · Enter auswählen · Esc schliessen</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backdropTouch: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 120,
    paddingHorizontal: spacing.xl,
  },
  palette: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    width: '100%',
    maxWidth: 560,
    ...shadows.lg,
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    paddingVertical: spacing.sm,
    outlineStyle: 'none',
  } as any,
  escBadge: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  escText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  results: {
    maxHeight: 360,
  },
  sectionLabel: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  resultItemSelected: {
    backgroundColor: colors.primary + '10',
  },
  resultText: {
    flex: 1,
  },
  resultLabel: {
    ...typography.body,
    fontSize: 15,
  },
  resultLabelSelected: {
    color: colors.primary,
    fontWeight: '500',
  },
  resultDesc: {
    ...typography.caption,
    marginTop: 1,
  },
  empty: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textLight,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  footerText: {
    ...typography.caption,
    color: colors.textLight,
    textAlign: 'center',
  },
});
