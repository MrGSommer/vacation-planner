import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Switch, TouchableOpacity, Alert, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Header, Card } from '../../components/common';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { updateProfile } from '../../api/auth';
import { getAiUserMemory, deleteAiUserMemory } from '../../api/aiMemory';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { RootStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'FableSettings'>;

export const FableSettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { user, profile, refreshProfile } = useAuth();
  const { isPremium, aiCredits } = useSubscription();

  const [customInstruction, setCustomInstruction] = useState(profile?.ai_custom_instruction || '');
  const [aiContextEnabled, setAiContextEnabled] = useState(profile?.ai_trip_context_enabled ?? true);
  const [memoryText, setMemoryText] = useState<string | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(true);
  const [memoryDeleting, setMemoryDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getAiUserMemory()
      .then(text => setMemoryText(text))
      .catch(() => setMemoryText(null))
      .finally(() => setMemoryLoading(false));
  }, []);

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

  const handleDeleteMemory = async () => {
    const doDelete = async () => {
      setMemoryDeleting(true);
      try {
        await deleteAiUserMemory();
        setMemoryText(null);
      } catch {
        Alert.alert('Fehler', 'Memory konnte nicht gelöscht werden');
      } finally {
        setMemoryDeleting(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Fable vergisst alle gelernten Vorlieben. Fortfahren?')) {
        await doDelete();
      }
    } else {
      Alert.alert(
        'Memory löschen',
        'Fable vergisst alle gelernten Vorlieben. Fortfahren?',
        [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Löschen', style: 'destructive', onPress: doDelete },
        ],
      );
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
          <Text style={styles.cardTitle}>Persönliche Anweisung</Text>
          <Text style={styles.cardDesc}>
            Gib Fable eine Anweisung, die bei jeder Konversation berücksichtigt wird (z.B. "Antworte kurz und knapp" oder "Ich bin Vegetarier").
          </Text>
          <TextInput
            style={styles.textArea}
            value={customInstruction}
            onChangeText={setCustomInstruction}
            placeholder="z.B. Antworte kurz und knapp..."
            placeholderTextColor={colors.textLight}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
          <View style={styles.instructionFooter}>
            <Text style={styles.charCount}>{customInstruction.length}/500</Text>
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
              <Text style={styles.toggleDesc}>Erlaubt Fable, bestehende Trip-Daten für bessere Vorschläge zu nutzen</Text>
            </View>
            <Switch
              value={aiContextEnabled}
              onValueChange={handleContextToggle}
              trackColor={{ false: colors.border, true: colors.secondary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </Card>

        {/* Memory */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Fable-Memory</Text>
          <Text style={styles.cardDesc}>
            Fable merkt sich deine Vorlieben aus Gesprächen (z.B. Ernährung, Reisestil).
          </Text>
          {memoryLoading ? (
            <Text style={styles.memoryText}>Wird geladen...</Text>
          ) : memoryText ? (
            <View style={styles.memoryBox}>
              <Text style={styles.memoryText}>{memoryText}</Text>
            </View>
          ) : (
            <Text style={styles.memoryEmpty}>Noch keine Vorlieben gespeichert</Text>
          )}
          {memoryText && (
            <TouchableOpacity
              style={[styles.deleteBtn, memoryDeleting && { opacity: 0.6 }]}
              onPress={handleDeleteMemory}
              disabled={memoryDeleting}
            >
              <Text style={styles.deleteBtnText}>
                {memoryDeleting ? 'Wird gelöscht...' : 'Memory löschen'}
              </Text>
            </TouchableOpacity>
          )}
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
    minHeight: 100,
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
  memoryBox: { backgroundColor: colors.background, borderRadius: borderRadius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  memoryText: { ...typography.bodySmall, color: colors.textSecondary },
  memoryEmpty: { ...typography.bodySmall, color: colors.textLight, fontStyle: 'italic' },
  deleteBtn: { marginTop: spacing.sm, alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.md, backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: colors.error + '30' },
  deleteBtnText: { ...typography.caption, color: colors.error, fontWeight: '600' },
});
