import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, Switch } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Card, Button } from '../../components/common';
import { useAuth } from '../../hooks/useAuth';
import { useTrips } from '../../hooks/useTrips';
import { updateProfile } from '../../api/auth';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import appJson from '../../../app.json';

type Props = { navigation: NativeStackNavigationProp<any> };

const AI_ALLOWED_EMAIL = process.env.EXPO_PUBLIC_AI_ALLOWED_EMAIL;

export const ProfileScreen: React.FC<Props> = ({ navigation }) => {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { trips } = useTrips();
  const insets = useSafeAreaInsets();
  const [aiContextEnabled, setAiContextEnabled] = useState(profile?.ai_trip_context_enabled ?? true);

  const handleAiContextToggle = async (value: boolean) => {
    setAiContextEnabled(value);
    if (user) {
      try {
        await updateProfile(user.id, { ai_trip_context_enabled: value });
        refreshProfile?.();
      } catch (e) {
        setAiContextEnabled(!value);
      }
    }
  };

  const handleSignOut = async () => {
    if (Platform.OS === 'web') {
      if (!window.confirm('Möchtest du dich wirklich abmelden?')) return;
      await signOut();
    } else {
      Alert.alert('Abmelden', 'Möchtest du dich wirklich abmelden?', [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Abmelden', style: 'destructive', onPress: signOut },
      ]);
    }
  };

  const completedTrips = trips.filter(t => t.status === 'completed').length;
  const upcomingTrips = trips.filter(t => t.status === 'upcoming' || t.status === 'planning').length;

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profil</Text>

      <View style={styles.profileSection}>
        <Avatar uri={profile?.avatar_url} name={profile?.full_name || user?.email || ''} size={80} />
        <Text style={styles.name}>{profile?.full_name || 'Reisender'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{trips.length}</Text>
          <Text style={styles.statLabel}>Reisen</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{completedTrips}</Text>
          <Text style={styles.statLabel}>Abgeschlossen</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{upcomingTrips}</Text>
          <Text style={styles.statLabel}>Geplant</Text>
        </Card>
      </View>

      <Card style={styles.settingsCard}>
        <TouchableOpacity style={styles.settingsRow} onPress={() => navigation.navigate('EditProfile')}>
          <Text style={styles.settingsIcon}>👤</Text>
          <Text style={styles.settingsText}>Profil bearbeiten</Text>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.settingsRow} onPress={() => navigation.navigate('Notifications')}>
          <Text style={styles.settingsIcon}>🔔</Text>
          <Text style={styles.settingsText}>Benachrichtigungen</Text>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.settingsRow} onPress={() => navigation.navigate('LanguageCurrency')}>
          <Text style={styles.settingsIcon}>🌐</Text>
          <Text style={styles.settingsText}>Sprache & Währung</Text>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
      </Card>

      {AI_ALLOWED_EMAIL && user?.email === AI_ALLOWED_EMAIL && (
        <Card style={styles.aiSettingsCard}>
          <Text style={styles.aiSettingsTitle}>{'🤖 KI-Einstellungen'}</Text>
          <View style={styles.aiSettingsRow}>
            <View style={styles.aiSettingsInfo}>
              <Text style={styles.aiSettingsLabel}>Reisedaten als KI-Kontext verwenden</Text>
              <Text style={styles.aiSettingsDesc}>Erlaubt dem KI-Reiseplaner, bestehende Trip-Daten fuer bessere Vorschlaege zu nutzen</Text>
            </View>
            <Switch
              value={aiContextEnabled}
              onValueChange={handleAiContextToggle}
              trackColor={{ false: colors.border, true: colors.secondary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </Card>
      )}

      <Button title="Abmelden" onPress={handleSignOut} variant="secondary" style={styles.logoutButton} />

      <Text style={styles.version}>Version {appJson.expo.version}</Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl },
  title: { ...typography.h1, marginBottom: spacing.xl },
  profileSection: { alignItems: 'center', marginBottom: spacing.xl },
  name: { ...typography.h2, marginTop: spacing.md },
  email: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  statCard: { flex: 1, alignItems: 'center' },
  statValue: { ...typography.h2, color: colors.primary },
  statLabel: { ...typography.caption, marginTop: 2 },
  settingsCard: { marginBottom: spacing.xl },
  settingsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  settingsIcon: { fontSize: 20, marginRight: spacing.md },
  settingsText: { ...typography.body, flex: 1 },
  arrow: { fontSize: 20, color: colors.textLight },
  divider: { height: 1, backgroundColor: colors.border },
  aiSettingsCard: { marginBottom: spacing.xl },
  aiSettingsTitle: { ...typography.h3, marginBottom: spacing.md },
  aiSettingsRow: { flexDirection: 'row', alignItems: 'center' },
  aiSettingsInfo: { flex: 1, marginRight: spacing.md },
  aiSettingsLabel: { ...typography.body, fontWeight: '500' },
  aiSettingsDesc: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  logoutButton: { marginTop: spacing.md },
  version: { ...typography.caption, color: colors.textLight, textAlign: 'center', marginTop: spacing.xl, marginBottom: spacing.md },
});
