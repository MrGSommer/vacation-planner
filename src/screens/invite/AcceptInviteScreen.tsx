import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../../components/common';
import { getInviteByToken, acceptInvite, getCollaborators } from '../../api/invitations';
import { getTrip, updateTrip } from '../../api/trips';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { TripInvitation } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AcceptInvite'>;

export const AcceptInviteScreen: React.FC<Props> = ({ navigation, route }) => {
  const { token } = route.params;
  const { session } = useAuthContext();
  const { showToast } = useToast();
  const [invitation, setInvitation] = useState<TripInvitation | null>(null);
  const [trip, setTrip] = useState<{ id: string; name: string; destination: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await getInviteByToken(token);
        setInvitation(data.invitation);
        setTrip(data.trip);
      } catch (e: any) {
        setError(e.message || 'Einladung nicht gefunden oder ungültig.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleAccept = async () => {
    if (!session?.user?.id || !invitation) return;
    setAccepting(true);
    try {
      await acceptInvite(token);
      // Auto-adjust group_type if solo
      try {
        const tripData = await getTrip(invitation.trip_id);
        if (tripData.group_type === 'solo') {
          const collabs = await getCollaborators(invitation.trip_id);
          if (collabs.length >= 2) {
            await updateTrip(invitation.trip_id, {
              group_type: 'friends',
              travelers_count: collabs.length,
            });
            showToast('Reisegruppe wurde auf "Freunde" angepasst', 'info', 5000);
          }
        }
      } catch (e) {
        console.error('Auto-adjust group_type failed:', e);
      }
      setDone(true);
    } catch (e: any) {
      setError(e.message || 'Fehler beim Annehmen der Einladung');
    } finally {
      setAccepting(false);
    }
  };

  const handleGoToTrip = () => {
    if (invitation) {
      navigation.reset({ index: 0, routes: [{ name: 'Main' }, { name: 'TripDetail', params: { tripId: invitation.trip_id } }] });
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Einladung wird geladen...</Text>
      </View>
    );
  }

  if (error && !invitation) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorIcon}>😕</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Button title="Zur Startseite" onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })} style={styles.btn} />
      </View>
    );
  }

  if (done) {
    return (
      <View style={styles.center}>
        <Text style={styles.successIcon}>✅</Text>
        <Text style={styles.title}>Einladung angenommen!</Text>
        <Text style={styles.subtitle}>Du hast jetzt Zugriff auf «{trip?.name}».</Text>
        <Button title="Reise öffnen" onPress={handleGoToTrip} style={styles.btn} />
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <View style={styles.card}>
        <Text style={styles.cardIcon}>✉️</Text>
        <Text style={styles.title}>Einladung</Text>
        {trip && <Text style={styles.tripName}>{trip.name}</Text>}
        {trip && <Text style={styles.subtitle}>{trip.destination}</Text>}
        <Text style={styles.roleText}>
          Rolle: {invitation?.role === 'editor' ? 'Bearbeiter' : 'Betrachter'}
        </Text>
        {error && <Text style={styles.errorSmall}>{error}</Text>}
        <Button title="Einladung annehmen" onPress={handleAccept} loading={accepting} style={styles.btn} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: spacing.xl },
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.xxl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    ...shadows.lg,
  },
  cardIcon: { fontSize: 48, marginBottom: spacing.md },
  title: { ...typography.h2, textAlign: 'center', marginBottom: spacing.xs },
  tripName: { ...typography.h3, color: colors.primary, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
  roleText: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.lg },
  btn: { marginTop: spacing.md, width: '100%' },
  errorIcon: { fontSize: 48, marginBottom: spacing.md },
  errorText: { ...typography.body, color: colors.error, textAlign: 'center', marginBottom: spacing.lg },
  successIcon: { fontSize: 48, marginBottom: spacing.md },
  errorSmall: { ...typography.bodySmall, color: colors.error, textAlign: 'center', marginBottom: spacing.sm },
});
