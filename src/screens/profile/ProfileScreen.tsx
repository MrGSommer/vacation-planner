import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, Modal, ActivityIndicator } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Card, Button, BuyInspirationenModal, PaymentWarningBanner } from '../../components/common';
import { PasswordInput } from '../../components/common/PasswordInput';
import { Input } from '../../components/common/Input';
import { useAuth } from '../../hooks/useAuth';
import { useAdmin } from '../../hooks/useAdmin';
import { useTrips } from '../../hooks/useTrips';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useToast } from '../../contexts/ToastContext';
import { createPortalSession } from '../../api/stripe';
import { deleteAccount, updateProfile } from '../../api/auth';
import { getDisplayName } from '../../utils/profileHelpers';
import { colors, spacing, borderRadius, typography, iconSize } from '../../utils/theme';
import { Icon, SETTINGS_ICONS, NAV_ICONS } from '../../utils/icons';
import appJson from '../../../app.json';
import { BUILD_NUMBER, BUILD_STAMP } from '../../utils/buildInfo';

type Props = { navigation: NativeStackNavigationProp<any> };

export const ProfileScreen: React.FC<Props> = ({ navigation }) => {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { isAdmin } = useAdmin();
  const { trips } = useTrips();
  const { isPremium, isTrialing, trialDaysLeft, aiCredits, isFeatureAllowed, paymentWarning, paymentErrorMessage } = useSubscription();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const [stripeLoading, setStripeLoading] = useState<'portal' | null>(null);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'confirm' | 'password'>('confirm');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isOAuthUser = user?.app_metadata?.provider === 'google'
    || user?.identities?.some((i: any) => i.provider === 'google');

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      if (isOAuthUser) {
        await deleteAccount(undefined, deleteConfirmText);
      } else {
        await deleteAccount(deletePassword);
      }
      // Account deleted — signOut already called in deleteAccount()
      setShowDeleteModal(false);
    } catch (e: any) {
      setDeleteError(e?.message || 'Kontolöschung fehlgeschlagen');
    } finally {
      setDeleteLoading(false);
    }
  };

  const openDeleteModal = () => {
    setDeleteStep('confirm');
    setDeletePassword('');
    setDeleteConfirmText('');
    setDeleteError(null);
    setShowDeleteModal(true);
  };

  // Refresh profile (and credits) every time this tab gains focus
  useFocusEffect(
    useCallback(() => {
      refreshProfile?.();
    }, [refreshProfile])
  );

  const handleSignOut = async () => {
    const doSignOut = async () => {
      await signOut();
      showToast('Erfolgreich abgemeldet', 'success');
    };
    if (Platform.OS === 'web') {
      if (!window.confirm('Möchtest du dich wirklich abmelden?')) return;
      await doSignOut();
    } else {
      Alert.alert('Abmelden', 'Möchtest du dich wirklich abmelden?', [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Abmelden', style: 'destructive', onPress: doSignOut },
      ]);
    }
  };

  const completedTrips = trips.filter(t => t.status === 'completed').length;
  const upcomingTrips = trips.filter(t => t.status === 'upcoming' || t.status === 'planning').length;

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profil</Text>

      <View style={styles.profileSection}>
        <Avatar uri={profile?.avatar_url} name={profile ? getDisplayName(profile) : (user?.email || '')} size={80} />
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
          <Text style={styles.statLabel}>Erlebt</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{upcomingTrips}</Text>
          <Text style={styles.statLabel}>Geplant</Text>
        </Card>
      </View>

      <Card style={styles.settingsCard}>
        <TouchableOpacity style={styles.settingsRow} onPress={() => navigation.navigate('EditProfile')}>
          <View style={styles.settingsIconWrap}><Icon name={SETTINGS_ICONS.editProfile} size={iconSize.sm} color={colors.secondary} /></View>
          <Text style={styles.settingsText}>Profil bearbeiten</Text>
          <Icon name={NAV_ICONS.forward} size={iconSize.xs} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.settingsRow} onPress={() => navigation.navigate('Notifications')}>
          <View style={styles.settingsIconWrap}><Icon name={SETTINGS_ICONS.notifications} size={iconSize.sm} color={colors.primary} /></View>
          <Text style={styles.settingsText}>Benachrichtigungen</Text>
          <Icon name={NAV_ICONS.forward} size={iconSize.xs} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.settingsRow} onPress={() => navigation.navigate('LanguageCurrency')}>
          <View style={styles.settingsIconWrap}><Icon name={SETTINGS_ICONS.language} size={iconSize.sm} color={colors.accent} /></View>
          <Text style={styles.settingsText}>Sprache & Währung</Text>
          <Icon name={NAV_ICONS.forward} size={iconSize.xs} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.settingsRow} onPress={() => {
          const current = profile?.preferred_maps_app;
          const next = current === 'google' ? 'apple' : current === 'apple' ? null : 'google';
          if (profile) {
            updateProfile(profile.id, { preferred_maps_app: next } as any)
              .then(() => { refreshProfile?.(); showToast(next ? `Navigation: ${next === 'google' ? 'Google Maps' : 'Apple Maps'}` : 'Navigation: Immer fragen', 'success'); })
              .catch(() => showToast('Fehler beim Speichern', 'error'));
          }
        }}>
          <View style={styles.settingsIconWrap}><Icon name="navigate-outline" size={iconSize.sm} color={colors.secondary} /></View>
          <Text style={styles.settingsText}>Navigation</Text>
          <Text style={styles.settingsValue}>
            {profile?.preferred_maps_app === 'google' ? 'Google Maps' : profile?.preferred_maps_app === 'apple' ? 'Apple Maps' : 'Immer fragen'}
          </Text>
        </TouchableOpacity>
      </Card>

      {paymentWarning && (
        <PaymentWarningBanner message={paymentErrorMessage} />
      )}

      {/* Subscription */}
      <Card style={styles.aiSettingsCard}>
        <Text style={styles.aiSettingsTitle}>Abonnement</Text>
        <View style={styles.subscriptionRow}>
          <Text style={styles.subscriptionLabel}>Status</Text>
          <Text style={[styles.subscriptionValue, isPremium && { color: colors.secondary }]}>
            {isTrialing
              ? `Premium-Test (noch ${trialDaysLeft} ${trialDaysLeft === 1 ? 'Tag' : 'Tage'})`
              : isPremium ? 'Premium' : 'Free'
            }
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
        <Card style={styles.settingsCard} onPress={() => navigation.navigate('FableSettings')}>
          <View style={styles.settingsRow}>
            <View style={styles.settingsIconWrap}><Icon name={SETTINGS_ICONS.fable} size={iconSize.sm} color={colors.secondary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsText}>Fable & KI</Text>
              <Text style={styles.settingsDesc}>Anweisungen, Memory, Kontext</Text>
            </View>
            <Icon name={NAV_ICONS.forward} size={iconSize.xs} color={colors.textSecondary} />
          </View>
        </Card>
      )}

      {isAdmin && (
        <>
          <Card style={styles.settingsCard} onPress={() => navigation.navigate('AdminDashboard')}>
            <View style={styles.settingsRow}>
              <View style={styles.settingsIconWrap}><Icon name={SETTINGS_ICONS.admin} size={iconSize.sm} color={colors.error} /></View>
              <Text style={styles.settingsText}>Admin Dashboard</Text>
              <Icon name={NAV_ICONS.forward} size={iconSize.xs} color={colors.textSecondary} />
            </View>
          </Card>
          <Card style={styles.settingsCard} onPress={() => navigation.navigate('BetaDashboard')}>
            <View style={styles.settingsRow}>
              <View style={styles.settingsIconWrap}><Icon name={SETTINGS_ICONS.beta} size={iconSize.sm} color={colors.accent} /></View>
              <Text style={styles.settingsText}>Beta-Dashboard</Text>
              <Icon name={NAV_ICONS.forward} size={iconSize.xs} color={colors.textSecondary} />
            </View>
          </Card>
          <Card style={styles.settingsCard} onPress={() => navigation.navigate('AdminInsights')}>
            <View style={styles.settingsRow}>
              <View style={styles.settingsIconWrap}><Icon name="analytics-outline" size={iconSize.sm} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsText}>Insights & Analytics</Text>
                <Text style={styles.settingsDesc}>Funnel, Retention, KI-Reports</Text>
              </View>
              <Icon name={NAV_ICONS.forward} size={iconSize.xs} color={colors.textSecondary} />
            </View>
          </Card>
        </>
      )}

      {/* Legal */}
      <Card style={styles.settingsCard}>
        <TouchableOpacity style={styles.settingsRow} onPress={() => navigation.navigate('Datenschutz')}>
          <View style={styles.settingsIconWrap}><Icon name={SETTINGS_ICONS.privacy} size={iconSize.sm} color={colors.accent} /></View>
          <Text style={styles.settingsText}>Datenschutz</Text>
          <Icon name={NAV_ICONS.forward} size={iconSize.xs} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.settingsRow} onPress={() => navigation.navigate('AGB')}>
          <View style={styles.settingsIconWrap}><Icon name={SETTINGS_ICONS.terms} size={iconSize.sm} color={colors.accent} /></View>
          <Text style={styles.settingsText}>AGB</Text>
          <Icon name={NAV_ICONS.forward} size={iconSize.xs} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.settingsRow} onPress={() => navigation.navigate('Impressum')}>
          <View style={styles.settingsIconWrap}><Icon name={SETTINGS_ICONS.impressum} size={iconSize.sm} color={colors.accent} /></View>
          <Text style={styles.settingsText}>Impressum</Text>
          <Icon name={NAV_ICONS.forward} size={iconSize.xs} color={colors.textSecondary} />
        </TouchableOpacity>
      </Card>

      <Button title="Abmelden" onPress={handleSignOut} variant="secondary" style={styles.logoutButton} />

      <TouchableOpacity style={styles.deleteAccountBtn} onPress={openDeleteModal}>
        <Text style={styles.deleteAccountText}>Konto löschen</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Version {appJson.expo.version} (Build {BUILD_NUMBER})</Text>

      <BuyInspirationenModal
        visible={showBuyModal}
        onClose={() => { setShowBuyModal(false); refreshProfile?.(); }}
        userId={user?.id || ''}
        email={user?.email || ''}
      />

      {/* Delete Account Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => !deleteLoading && setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {deleteStep === 'confirm' ? (
              <>
                <Text style={styles.modalTitle}>Konto endgültig löschen?</Text>
                <Text style={styles.modalBody}>
                  {'\u2022'} Geteilte Reisen werden an Mitreisende übertragen{'\n'}
                  {'\u2022'} Reisen ohne Mitreisende werden gelöscht{'\n'}
                  {'\u2022'} Dein Abonnement wird gekündigt{'\n'}
                  {'\u2022'} Alle persönlichen Daten werden entfernt{'\n'}
                  {'\u2022'} Dieser Vorgang ist unwiderruflich
                </Text>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.modalBtnCancel}
                    onPress={() => setShowDeleteModal(false)}
                  >
                    <Text style={styles.modalBtnCancelText}>Abbrechen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalBtnDanger}
                    onPress={() => setDeleteStep('password')}
                  >
                    <Text style={styles.modalBtnDangerText}>Weiter</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>
                  {isOAuthUser ? 'Löschung bestätigen' : 'Passwort bestätigen'}
                </Text>
                {isOAuthUser ? (
                  <>
                    <Text style={styles.modalBody}>
                      Gib «LÖSCHEN» ein, um dein Konto unwiderruflich zu löschen.
                    </Text>
                    <Input
                      label=""
                      placeholder='LÖSCHEN'
                      value={deleteConfirmText}
                      onChangeText={setDeleteConfirmText}
                      autoCapitalize="characters"
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.modalBody}>
                      Gib dein Passwort ein, um die Löschung zu bestätigen.
                    </Text>
                    <PasswordInput
                      label=""
                      placeholder="Dein Passwort"
                      value={deletePassword}
                      onChangeText={setDeletePassword}
                    />
                  </>
                )}
                {deleteError && (
                  <View style={styles.deleteErrorBox}>
                    <Text style={styles.deleteErrorText}>{deleteError}</Text>
                  </View>
                )}
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.modalBtnCancel}
                    onPress={() => { setDeleteStep('confirm'); setDeleteError(null); }}
                    disabled={deleteLoading}
                  >
                    <Text style={styles.modalBtnCancelText}>Zurück</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtnDanger, deleteLoading && { opacity: 0.6 }]}
                    onPress={handleDeleteAccount}
                    disabled={deleteLoading || (!isOAuthUser && !deletePassword) || (isOAuthUser && deleteConfirmText !== 'LÖSCHEN')}
                  >
                    {deleteLoading ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.modalBtnDangerText}>Konto löschen</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  settingsIconWrap: { width: 32, height: 32, borderRadius: 8, marginRight: spacing.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  settingsText: { ...typography.body, flex: 1 },
  settingsDesc: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  settingsValue: { ...typography.bodySmall, color: colors.textSecondary },
  arrow: { color: colors.textLight },
  divider: { height: 1, backgroundColor: colors.border },
  aiSettingsCard: { marginBottom: spacing.xl },
  aiSettingsTitle: { ...typography.h3, marginBottom: spacing.md },
  subscriptionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  subscriptionLabel: { ...typography.body, color: colors.textSecondary },
  subscriptionValue: { ...typography.body, fontWeight: '600' },
  stripeErrorBox: { backgroundColor: '#FFEAEA', padding: spacing.sm, borderRadius: borderRadius.md, marginBottom: spacing.sm },
  stripeErrorText: { ...typography.caption, color: colors.error, textAlign: 'center' },
  subscriptionBtn: { backgroundColor: colors.background, borderRadius: borderRadius.md, padding: spacing.sm, alignItems: 'center', marginTop: spacing.sm },
  subscriptionBtnText: { ...typography.bodySmall, fontWeight: '600', color: colors.primary },
  logoutButton: { marginTop: spacing.md },
  deleteAccountBtn: { alignItems: 'center', marginTop: spacing.lg },
  deleteAccountText: { ...typography.bodySmall, color: colors.error },
  version: { ...typography.caption, color: colors.textLight, textAlign: 'center', marginTop: spacing.xl, marginBottom: spacing.md },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  modalContent: { backgroundColor: '#FFF', borderRadius: borderRadius.lg, padding: spacing.xl, width: '100%', maxWidth: 400 },
  modalTitle: { ...typography.h3, marginBottom: spacing.md },
  modalBody: { ...typography.body, color: colors.textSecondary, lineHeight: 22, marginBottom: spacing.lg },
  modalButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  modalBtnCancel: { flex: 1, paddingVertical: spacing.sm + 2, borderRadius: borderRadius.md, backgroundColor: colors.background, alignItems: 'center' },
  modalBtnCancelText: { ...typography.body, fontWeight: '600', color: colors.textSecondary },
  modalBtnDanger: { flex: 1, paddingVertical: spacing.sm + 2, borderRadius: borderRadius.md, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center' },
  modalBtnDangerText: { ...typography.body, fontWeight: '600', color: '#FFF' },
  deleteErrorBox: { backgroundColor: '#FFEAEA', padding: spacing.sm, borderRadius: borderRadius.md, marginTop: spacing.sm },
  deleteErrorText: { ...typography.caption, color: colors.error, textAlign: 'center' },
});
