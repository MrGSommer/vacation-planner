import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Switch, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Header, Card } from '../../components/common';
import { useAuth } from '../../hooks/useAuth';
import { getTrip, updateTrip } from '../../api/trips';
import { getCollaborators } from '../../api/invitations';
import { updateProfile } from '../../api/auth';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { RootStackParamList } from '../../types/navigation';
import { Trip } from '../../types/database';

type Props = NativeStackScreenProps<RootStackParamList, 'FableTripSettings'>;

export const FableTripSettingsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const { user, profile, refreshProfile } = useAuth();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [userRole, setUserRole] = useState<'owner' | 'editor' | 'viewer'>('viewer');
  const [loading, setLoading] = useState(true);

  // Group settings (from trip)
  const [fableEnabled, setFableEnabled] = useState(true);
  const [budgetVisible, setBudgetVisible] = useState(true);
  const [packingVisible, setPackingVisible] = useState(true);
  const [webSearch, setWebSearch] = useState(true);
  const [tripMemoryEnabled, setTripMemoryEnabled] = useState(true);
  const [tripInstruction, setTripInstruction] = useState('');
  const [instructionSaving, setInstructionSaving] = useState(false);
  const [instructionSaved, setInstructionSaved] = useState(false);

  // Personal settings (from profile)
  const [nameVisible, setNameVisible] = useState(profile?.fable_name_visible ?? true);
  const [personalMemoryEnabled, setPersonalMemoryEnabled] = useState(profile?.fable_memory_enabled ?? true);

  const canEdit = userRole === 'owner' || userRole === 'editor';

  useEffect(() => {
    const load = async () => {
      try {
        const [tripData, collabs] = await Promise.all([
          getTrip(tripId),
          getCollaborators(tripId).catch(() => []),
        ]);
        setTrip(tripData);
        setFableEnabled(tripData.fable_enabled);
        setBudgetVisible(tripData.fable_budget_visible);
        setPackingVisible(tripData.fable_packing_visible);
        setWebSearch(tripData.fable_web_search);
        setTripMemoryEnabled(tripData.fable_memory_enabled);
        setTripInstruction(tripData.fable_instruction || '');

        // Determine user role
        if (tripData.owner_id === user?.id) {
          setUserRole('owner');
        } else {
          const collab = collabs.find(c => c.user_id === user?.id);
          setUserRole(collab?.role || 'viewer');
        }
      } catch {
        Alert.alert('Fehler', 'Trip konnte nicht geladen werden');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tripId, user?.id]);

  const handleGroupToggle = async (field: keyof Trip, value: boolean, setter: (v: boolean) => void) => {
    if (!canEdit) return;
    setter(value);
    try {
      await updateTrip(tripId, { [field]: value } as Partial<Trip>);
    } catch {
      setter(!value);
    }
  };

  const handleSaveInstruction = async () => {
    if (!canEdit) return;
    setInstructionSaving(true);
    try {
      const value = tripInstruction.trim() || null;
      await updateTrip(tripId, { fable_instruction: value } as Partial<Trip>);
      setInstructionSaved(true);
      setTimeout(() => setInstructionSaved(false), 2000);
    } catch {
      Alert.alert('Fehler', 'Anweisung konnte nicht gespeichert werden');
    } finally {
      setInstructionSaving(false);
    }
  };

  const handlePersonalToggle = async (field: string, value: boolean, setter: (v: boolean) => void) => {
    if (!user) return;
    setter(value);
    try {
      await updateProfile(user.id, { [field]: value });
      await refreshProfile();
    } catch {
      setter(!value);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Fable-Einstellungen" onBack={() => navigation.goBack()} />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Wird geladen...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Fable-Einstellungen" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Group Settings */}
        <Text style={styles.sectionTitle}>Gruppeneinstellungen</Text>
        {!canEdit && (
          <Text style={styles.readOnlyHint}>Nur Admins und Editoren koennen diese Einstellungen aendern.</Text>
        )}

        <Card style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Fable aktiviert</Text>
              <Text style={styles.toggleDesc}>Master-Schalter: Fable fuer diese Reise ein-/ausschalten</Text>
            </View>
            <Switch
              value={fableEnabled}
              onValueChange={(v) => handleGroupToggle('fable_enabled', v, setFableEnabled)}
              trackColor={{ false: colors.border, true: colors.secondary }}
              thumbColor="#FFFFFF"
              disabled={!canEdit}
            />
          </View>
        </Card>

        <Card style={[styles.card, !fableEnabled && styles.cardDisabled]}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Budget sichtbar</Text>
              <Text style={styles.toggleDesc}>Fable darf Budget-Daten sehen und vorschlagen</Text>
            </View>
            <Switch
              value={budgetVisible}
              onValueChange={(v) => handleGroupToggle('fable_budget_visible', v, setBudgetVisible)}
              trackColor={{ false: colors.border, true: colors.secondary }}
              thumbColor="#FFFFFF"
              disabled={!canEdit || !fableEnabled}
            />
          </View>
        </Card>

        <Card style={[styles.card, !fableEnabled && styles.cardDisabled]}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Packliste sichtbar</Text>
              <Text style={styles.toggleDesc}>Fable darf Packlisten-Daten sehen und vorschlagen</Text>
            </View>
            <Switch
              value={packingVisible}
              onValueChange={(v) => handleGroupToggle('fable_packing_visible', v, setPackingVisible)}
              trackColor={{ false: colors.border, true: colors.secondary }}
              thumbColor="#FFFFFF"
              disabled={!canEdit || !fableEnabled}
            />
          </View>
        </Card>

        <Card style={[styles.card, !fableEnabled && styles.cardDisabled]}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Web-Suche erlaubt</Text>
              <Text style={styles.toggleDesc}>Fable darf im Web nach aktuellen Infos suchen</Text>
            </View>
            <Switch
              value={webSearch}
              onValueChange={(v) => handleGroupToggle('fable_web_search', v, setWebSearch)}
              trackColor={{ false: colors.border, true: colors.secondary }}
              thumbColor="#FFFFFF"
              disabled={!canEdit || !fableEnabled}
            />
          </View>
        </Card>

        <Card style={[styles.card, !fableEnabled && styles.cardDisabled]}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Trip-Erinnerungen</Text>
              <Text style={styles.toggleDesc}>Fable darf sich Gespraechsinhalte dieser Reise merken</Text>
            </View>
            <Switch
              value={tripMemoryEnabled}
              onValueChange={(v) => handleGroupToggle('fable_memory_enabled', v, setTripMemoryEnabled)}
              trackColor={{ false: colors.border, true: colors.secondary }}
              thumbColor="#FFFFFF"
              disabled={!canEdit || !fableEnabled}
            />
          </View>
        </Card>

        <Card style={[styles.card, !fableEnabled && styles.cardDisabled]}>
          <Text style={styles.cardTitle}>Trip-Anweisung</Text>
          <Text style={styles.cardDesc}>
            Eine Anweisung fuer Fable, die fuer alle Teilnehmer dieser Reise gilt.
          </Text>
          <TextInput
            style={[styles.textArea, (!canEdit || !fableEnabled) && styles.textAreaDisabled]}
            value={tripInstruction}
            onChangeText={setTripInstruction}
            placeholder="z.B. Nur vegetarische Restaurants vorschlagen"
            placeholderTextColor={colors.textLight}
            multiline
            maxLength={500}
            textAlignVertical="top"
            editable={canEdit && fableEnabled}
          />
          {canEdit && fableEnabled && (
            <View style={styles.instructionFooter}>
              <Text style={styles.charCount}>{tripInstruction.length}/500</Text>
              <View
                style={[styles.saveBtn, (instructionSaving || instructionSaved) && { opacity: 0.7 }]}
                onTouchEnd={!instructionSaving ? handleSaveInstruction : undefined}
              >
                <Text style={styles.saveBtnText}>
                  {instructionSaved ? 'Gespeichert' : instructionSaving ? 'Speichern...' : 'Speichern'}
                </Text>
              </View>
            </View>
          )}
        </Card>

        {/* Personal Settings */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Deine Einstellungen</Text>

        <Card style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Name sichtbar fuer Fable</Text>
              <Text style={styles.toggleDesc}>Wenn deaktiviert, sieht Fable dich als "Reisender"</Text>
            </View>
            <Switch
              value={nameVisible}
              onValueChange={(v) => handlePersonalToggle('fable_name_visible', v, setNameVisible)}
              trackColor={{ false: colors.border, true: colors.secondary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </Card>

        <Card style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Fable darf sich Vorlieben merken</Text>
              <Text style={styles.toggleDesc}>Betrifft nur deine persoenlichen Vorlieben, nicht Trip-Erinnerungen</Text>
            </View>
            <Switch
              value={personalMemoryEnabled}
              onValueChange={(v) => handlePersonalToggle('fable_memory_enabled', v, setPersonalMemoryEnabled)}
              trackColor={{ false: colors.border, true: colors.secondary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </Card>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...typography.body, color: colors.textLight },
  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },
  readOnlyHint: { ...typography.bodySmall, color: colors.textLight, fontStyle: 'italic', marginBottom: spacing.md },
  card: { marginBottom: spacing.md },
  cardDisabled: { opacity: 0.5 },
  cardTitle: { ...typography.h3, marginBottom: spacing.xs },
  cardDesc: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  toggleInfo: { flex: 1, marginRight: spacing.md },
  toggleLabel: { ...typography.body, fontWeight: '600', marginBottom: spacing.xs },
  toggleDesc: { ...typography.bodySmall, color: colors.textSecondary },
  textArea: {
    ...typography.body,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 80,
    color: colors.text,
  },
  textAreaDisabled: { backgroundColor: colors.border + '30' },
  instructionFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  charCount: { ...typography.caption, color: colors.textLight },
  saveBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.md },
  saveBtnText: { ...typography.bodySmall, color: '#FFFFFF', fontWeight: '600' },
});
