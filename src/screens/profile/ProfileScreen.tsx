import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, Switch } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Card, Button, BuyInspirationenModal } from '../../components/common';
import { useAuth } from '../../hooks/useAuth';
import { useTrips } from '../../hooks/useTrips';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { updateProfile } from '../../api/auth';
import { createPortalSession } from '../../api/stripe';
import { deleteAiUserMemory } from '../../api/aiMemory';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import appJson from '../../../app.json';

type Props = { navigation: NativeStackNavigationProp<any> };

export const ProfileScreen: React.FC<Props> = ({ navigation }) => {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { trips } = useTrips();
  const { isPremium, aiCredits, isFeatureAllowed } = useSubscription();
  const insets = useSafeAreaInsets();
  const [aiContextEnabled, setAiContextEnabled] = useState(profile?.ai_trip_context_enabled ?? true);
  const [stripeLoading, setStripeLoading] = useState<'portal' | null>(null);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [memoryDeleting, setMemoryDeleting] = useState(false);
  const [memoryDeleted, setMemoryDeleted] = useState(false);

  const handleDeleteMemory = async () => {
    const doDelete = async () => {
      setMemoryDeleting(true);
      try {
        await deleteAiUserMemory();
        setMemoryDeleted(true);
        setTimeout(() => setMemoryDeleted(false), 3000);
      } catch (e) {
        console.error('Failed to delete memory:', e);
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
        <Text style={styles.name}>{[profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Reisender'}</Text>
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

      {/* Subscription */}
      <Card style={styles.aiSettingsCard}>
        <Text style={styles.aiSettingsTitle}>Abonnement</Text>
        <View style={styles.subscriptionRow}>
          <Text style={styles.subscriptionLabel}>Status</Text>
          <Text style={[styles.subscriptionValue, isPremium && { color: colors.secondary }]}>
            {isPremium ? 'Premium' : 'Free'}
          </Text>
        </View>
        <View style={styles.subscriptionRow}>
          <Text style={styles.subscriptionLabel}>Inspirationen</Text>
          <Text style={styles.subscriptionValue}>{aiCredits}</Text>
        </View>
        {stripeError && (
          <View style={styles.stripeErrorBox}>
            <Text style={styles.stripeErrorText}>{stripeError}</Text>
          </View>
        )}
        {isPremium && (
          <TouchableOpacity
            style={[styles.subscriptionBtn, stripeLoading === 'portal' && { opacity: 0.6 }]}
            disabled={stripeLoading !== null}
            onPress={async () => {
              setStripeLoading('portal');
              setStripeError(null);
              try {
                const { url } = await createPortalSession();
                if (Platform.OS === 'web') window.location.href = url;
              } catch (e: any) {
                setStripeError(e?.message || 'Abo-Verwaltung konnte nicht geladen werden');
              } finally {
                setStripeLoading(null);
              }
            }}
          >
            <Text style={styles.subscriptionBtnText}>
              {stripeLoading === 'portal' ? 'Wird geladen...' : 'Abo verwalten'}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.subscriptionBtn, { marginTop: spacing.xs }]}
          onPress={() => {
            if (!user) return;
            if (Platform.OS === 'web') {
              setShowBuyModal(true);
            } else {
              navigation.navigate('Subscription');
            }
          }}
        >
          <Text style={styles.subscriptionBtnText}>Inspirationen kaufen</Text>
        </TouchableOpacity>
        {!isPremium && (
          <TouchableOpacity
            style={[styles.subscriptionBtn, { backgroundColor: colors.secondary, marginTop: spacing.xs }]}
            onPress={() => navigation.navigate('Subscription')}
          >
            <Text style={[styles.subscriptionBtnText, { color: '#FFFFFF' }]}>Upgrade auf Premium</Text>
          </TouchableOpacity>
        )}
      </Card>

      {isFeatureAllowed('ai') && (
        <Card style={styles.aiSettingsCard}>
          <Text style={styles.aiSettingsTitle}>Fable-Einstellungen</Text>
          <View style={styles.aiSettingsRow}>
            <View style={styles.aiSettingsInfo}>
              <Text style={styles.aiSettingsLabel}>Reisedaten als Kontext verwenden</Text>
              <Text style={styles.aiSettingsDesc}>Erlaubt Fable, bestehende Trip-Daten für bessere Vorschläge zu nutzen</Text>
            </View>
            <Switch
              value={aiContextEnabled}
              onValueChange={handleAiContextToggle}
              trackColor={{ false: colors.border, true: colors.secondary }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.aiSettingsRow}>
            <View style={styles.aiSettingsInfo}>
              <Text style={styles.aiSettingsLabel}>Fable-Memory</Text>
              <Text style={styles.aiSettingsDesc}>Fable merkt sich deine Vorlieben (z.B. Ernährung, Reisestil)</Text>
            </View>
            <TouchableOpacity
              style={[styles.memoryDeleteBtn, memoryDeleting && { opacity: 0.6 }]}
              onPress={handleDeleteMemory}
              disabled={memoryDeleting}
            >
              <Text style={styles.memoryDeleteBtnText}>
                {memoryDeleted ? 'Gelöscht' : memoryDeleting ? '...' : 'Löschen'}
              </Text>
            </TouchableOpacity>
          </View>
        </Card>
      )}

      {/* Legal */}
      <Card style={styles.settingsCard}>
        <TouchableOpacity style={styles.settingsRow} onPress={() => navigation.navigate('Datenschutz')}>
          <Text style={styles.settingsIcon}>🔒</Text>
          <Text style={styles.settingsText}>Datenschutz</Text>
          <Text style={styles.arrow}>{'›'}</Text>
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.settingsRow} onPress={() => navigation.navigate('AGB')}>
          <Text style={styles.settingsIcon}>📄</Text>
          <Text style={styles.settingsText}>AGB</Text>
          <Text style={styles.arrow}>{'›'}</Text>
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.settingsRow} onPress={() => navigation.navigate('Impressum')}>
          <Text style={styles.settingsIcon}>ℹ️</Text>
          <Text style={styles.settingsText}>Impressum</Text>
          <Text style={styles.arrow}>{'›'}</Text>
        </TouchableOpacity>
      </Card>

      <Button title="Abmelden" onPress={handleSignOut} variant="secondary" style={styles.logoutButton} />

      <Text style={styles.version}>Version {appJson.expo.version}</Text>

      <BuyInspirationenModal
        visible={showBuyModal}
        onClose={() => setShowBuyModal(false)}
        userId={user?.id || ''}
        email={user?.email || ''}
      />
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
  subscriptionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  subscriptionLabel: { ...typography.body, color: colors.textSecondary },
  subscriptionValue: { ...typography.body, fontWeight: '600' },
  stripeErrorBox: { backgroundColor: '#FFEAEA', padding: spacing.sm, borderRadius: borderRadius.md, marginBottom: spacing.sm },
  stripeErrorText: { ...typography.caption, color: colors.error, textAlign: 'center' },
  memoryDeleteBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.md, backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: colors.error + '30' },
  memoryDeleteBtnText: { ...typography.caption, color: colors.error, fontWeight: '600' },
  subscriptionBtn: { backgroundColor: colors.background, borderRadius: borderRadius.md, padding: spacing.sm, alignItems: 'center', marginTop: spacing.sm },
  subscriptionBtnText: { ...typography.bodySmall, fontWeight: '600', color: colors.primary },
  logoutButton: { marginTop: spacing.md },
  version: { ...typography.caption, color: colors.textLight, textAlign: 'center', marginTop: spacing.xl, marginBottom: spacing.md },
});
