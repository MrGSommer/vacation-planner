import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Header, Card } from '../../components/common';
import { useAuth } from '../../hooks/useAuth';
import { updateProfile } from '../../api/auth';
import { CURRENCIES } from '../../utils/constants';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { RootStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'LanguageCurrency'>;

const LANGUAGES = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
];

export const LanguageCurrencyScreen: React.FC<Props> = ({ navigation }) => {
  const { user, profile, refreshProfile } = useAuth();
  const [language, setLanguage] = useState(profile?.preferred_language ?? 'de');
  const [currency, setCurrency] = useState(profile?.preferred_currency ?? 'CHF');
  const [saving, setSaving] = useState(false);

  const save = async (updates: { preferred_language?: string; preferred_currency?: string }) => {
    if (!user) return;
    setSaving(true);
    try {
      await updateProfile(user.id, updates);
      await refreshProfile();
    } catch {
      Alert.alert('Fehler', 'Einstellung konnte nicht gespeichert werden');
    } finally {
      setSaving(false);
    }
  };

  const handleLanguage = (code: string) => {
    setLanguage(code);
    save({ preferred_language: code });
  };

  const handleCurrency = (code: string) => {
    setCurrency(code);
    save({ preferred_currency: code });
  };

  return (
    <View style={styles.container}>
      <Header title="Sprache & Währung" onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Sprache</Text>
        <Card style={styles.card}>
          {LANGUAGES.map((lang, i) => (
            <React.Fragment key={lang.code}>
              {i > 0 && <View style={styles.divider} />}
              <TouchableOpacity
                style={styles.option}
                onPress={() => handleLanguage(lang.code)}
                disabled={saving}
              >
                <Text style={styles.optionLabel}>{lang.label}</Text>
                {language === lang.code && <Text style={styles.check}>✓</Text>}
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </Card>

        <Text style={styles.sectionTitle}>Standardwährung</Text>
        <Card style={styles.card}>
          {CURRENCIES.map((cur, i) => (
            <React.Fragment key={cur.code}>
              {i > 0 && <View style={styles.divider} />}
              <TouchableOpacity
                style={styles.option}
                onPress={() => handleCurrency(cur.code)}
                disabled={saving}
              >
                <Text style={styles.optionLabel}>{cur.symbol} {cur.name}</Text>
                {currency === cur.code && <Text style={styles.check}>✓</Text>}
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </Card>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl },
  sectionTitle: { ...typography.bodySmall, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm, marginTop: spacing.md },
  card: { marginBottom: spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  optionLabel: { ...typography.body },
  check: { fontSize: 18, color: colors.primary, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border },
});
