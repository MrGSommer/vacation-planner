import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Switch, TouchableOpacity, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Header, Card } from '../../components/common';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { updateProfile } from '../../api/auth';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { RootStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'FableSettings'>;

export const FableSettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { user, profile, refreshProfile } = useAuth();
  const { isPremium, aiCredits } = useSubscription();

  const [customInstruction, setCustomInstruction] = useState(profile?.ai_custom_instruction || '');
  const [aiContextEnabled, setAiContextEnabled] = useState(profile?.ai_trip_context_enabled ?? true);
  const [nameVisible, setNameVisible] = useState(profile?.fable_name_visible ?? true);
  const [personalMemoryEnabled, setPersonalMemoryEnabled] = useState(profile?.fable_memory_enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Refresh profile on mount to pick up auto-appended memory from Fable
  useEffect(() => {
    refreshProfile().then(() => {}).catch(() => {});
  }, []);

  // Sync local state when profile changes (e.g. after refreshProfile)
  useEffect(() => {
    if (profile?.ai_custom_instruction !== undefined && !saving) {
      setCustomInstruction(profile.ai_custom_instruction || '');
    }
  }, [profile?.ai_custom_instruction]);

  const handleSaveInstruction = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const value = customInstruction.trim() || null;
      await updateProfile(user.id, { ai_custom_instruction: value });
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      Alert.alert('Fehler', 'Anweisung konnte nicht gespeichert werden');
    } finally {
      setSaving(false);
    }
  };

  const handleContextToggle = async (value: boolean) => {
    if (!user) return;
    setAiContextEnabled(value);
    try {
      await updateProfile(user.id, { ai_trip_context_enabled: value });
      await refreshProfile();
    } catch {
      setAiContextEnabled(!value);
    }
  };

  const handleToggle = async (field: string, value: boolean, setter: (v: boolean) => void) => {
    if (!user) return;
    setter(value);
    try {
      await updateProfile(user.id, { [field]: value });
      await refreshProfile();
    } catch {
      setter(!value);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Fable & KI" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Credits */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Inspirationen</Text>
          <View style={styles.creditRow}>
            <Text style={styles.creditLabel}>Aktueller Stand</Text>
            <Text style={styles.creditValue}>{aiCredits}</Text>
          </View>
          {isPremium && (
            <Text style={styles.creditNote}>30 Inspirationen pro Monat inklusive</Text>
          )}
        </Card>

        {/* Custom Instruction */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Persoenliche Anweisung</Text>
          <Text style={styles.cardDesc}>
            Hier stehen deine persoenlichen Vorlieben fuer Fable. Du kannst sie manuell bearbeiten — Fable ergaenzt sie auch automatisch aus Gespraechen.
          </Text>
          <TextInput
            style={styles.textArea}
            value={customInstruction}
            onChangeText={setCustomInstruction}
            placeholder="z.B. Ich bin Vegetarier, reise gerne mit dem Zug..."
            placeholderTextColor={colors.textLight}
            multiline
            maxLength={1000}
            textAlignVertical="top"
          />
          <View style={styles.instructionFooter}>
            <Text style={styles.charCount}>{customInstruction.length}/1000</Text>
            <TouchableOpacity
              style={[styles.saveBtn, (saving || saved) && { opacity: 0.7 }]}
              onPress={handleSaveInstruction}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>
                {saved ? 'Gespeichert' : saving ? 'Speichern...' : 'Speichern'}
              </Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Context Toggle */}
        <Card style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Reisedaten als Kontext</Text>
              <Text style={styles.toggleDesc}>Erlaubt Fable, bestehende Trip-Daten fuer bessere Vorschlaege zu nutzen</Text>
            </View>
            <Switch
              value={aiContextEnabled}
              onValueChange={handleContextToggle}
              trackColor={{ false: colors.border, true: colors.secondary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </Card>

        {/* Name Visibility */}
        <Card style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Name sichtbar fuer Fable</Text>
              <Text style={styles.toggleDesc}>Wenn deaktiviert, sieht Fable dich als "Reisender" statt deinem Namen</Text>
            </View>
            <Switch
              value={nameVisible}
              onValueChange={(v) => handleToggle('fable_name_visible', v, setNameVisible)}
              trackColor={{ false: colors.border, true: colors.secondary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </Card>

        {/* Personal Memory */}
        <Card style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Fable darf sich Vorlieben merken</Text>
              <Text style={styles.toggleDesc}>Fable ergaenzt deine persoenliche Anweisung automatisch mit neuen Erkenntnissen aus Gespraechen</Text>
            </View>
            <Switch
              value={personalMemoryEnabled}
              onValueChange={(v) => handleToggle('fable_memory_enabled', v, setPersonalMemoryEnabled)}
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
  card: { marginBottom: spacing.lg },
  cardTitle: { ...typography.h3, marginBottom: spacing.xs },
  cardDesc: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md },
  creditRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  creditLabel: { ...typography.body, color: colors.textSecondary },
  creditValue: { ...typography.h2, color: colors.primary },
  creditNote: { ...typography.caption, color: colors.secondary, marginTop: spacing.xs },
  textArea: {
    ...typography.body,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 120,
    color: colors.text,
  },
  instructionFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  charCount: { ...typography.caption, color: colors.textLight },
  saveBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.md },
  saveBtnText: { ...typography.bodySmall, color: '#FFFFFF', fontWeight: '600' },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  toggleInfo: { flex: 1, marginRight: spacing.md },
  toggleLabel: { ...typography.body, fontWeight: '600', marginBottom: spacing.xs },
  toggleDesc: { ...typography.bodySmall, color: colors.textSecondary },
});
