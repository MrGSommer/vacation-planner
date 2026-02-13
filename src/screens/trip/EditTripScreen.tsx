import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, Switch, Alert, Image, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Calendar, DateData } from 'react-native-calendars';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { Header, Input, Button, PlaceAutocomplete, Avatar } from '../../components/common';
import { PlaceResult } from '../../components/common/PlaceAutocomplete';
import { useTrips } from '../../hooks/useTrips';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { getTrip, uploadCoverImage } from '../../api/trips';
import { getDays, getActivities, deleteDay, moveActivitiesToDay } from '../../api/itineraries';
import { searchPhotos, triggerDownload, UnsplashPhoto } from '../../api/unsplash';
import {
  getCollaborators,
  removeCollaborator,
  updateCollaboratorRole,
  createInviteLink,
  CollaboratorWithProfile,
} from '../../api/invitations';
import { Trip } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { getDisplayName } from '../../utils/profileHelpers';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import { CURRENCIES } from '../../utils/constants';
import { formatDate, getDayDates } from '../../utils/dateHelpers';
import { EditTripSkeleton } from '../../components/skeletons/EditTripSkeleton';
import { extractDominantColor } from '../../utils/colorExtraction';

type CoverMode = 'none' | 'upload' | 'unsplash';

type Props = NativeStackScreenProps<RootStackParamList, 'EditTrip'>;

const roleLabels: Record<string, string> = {
  owner: 'Besitzer',
  editor: 'Bearbeiter',
  viewer: 'Betrachter',
};

export const EditTripScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const { update, loading: saving } = useTrips();
  const { user } = useAuthContext();
  const { showToast } = useToast();
  const [loadingTrip, setLoadingTrip] = useState(true);
  const [originalTrip, setOriginalTrip] = useState<Trip | null>(null);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [destinationLat, setDestinationLat] = useState<number | null>(null);
  const [destinationLng, setDestinationLng] = useState<number | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState('');
  const [notes, setNotes] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [coverMode, setCoverMode] = useState<CoverMode>('none');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [unsplashLoading, setUnsplashLoading] = useState(false);

  // Members
  const [members, setMembers] = useState<CollaboratorWithProfile[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer');

  // Fable settings
  const [fableEnabled, setFableEnabled] = useState(true);
  const [fableBudgetVisible, setFableBudgetVisible] = useState(true);
  const [fablePackingVisible, setFablePackingVisible] = useState(true);
  const [fableWebSearch, setFableWebSearch] = useState(true);
  const [fableMemoryEnabled, setFableMemoryEnabled] = useState(true);

  // Cache unsplash results so repeated toggles don't re-fetch
  const unsplashCache = useRef<UnsplashPhoto[]>([]);
  const unsplashIndex = useRef(0);
  const lastQuery = useRef('');

  const steps = ['Details', 'Daten', 'Optionen', 'Teilnehmer'];

  useEffect(() => {
    const load = async () => {
      try {
        const trip = await getTrip(tripId);
        setOriginalTrip(trip);
        setName(trip.name);
        setDestination(trip.destination);
        setDestinationLat(trip.destination_lat);
        setDestinationLng(trip.destination_lng);
        setStartDate(trip.start_date);
        setEndDate(trip.end_date);
        setCurrency(trip.currency);
        setNotes(trip.notes || '');
        setCoverImageUrl(trip.cover_image_url);
        if (trip.cover_image_url) {
          setCoverMode((trip as any).cover_image_attribution ? 'unsplash' : 'upload');
        }
        setFableEnabled(trip.fable_enabled);
        setFableBudgetVisible(trip.fable_budget_visible);
        setFablePackingVisible(trip.fable_packing_visible);
        setFableWebSearch(trip.fable_web_search);
        setFableMemoryEnabled(trip.fable_memory_enabled);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingTrip(false);
      }
    };
    load();
  }, [tripId]);

  const loadMembers = async () => {
    setMembersLoading(true);
    try {
      const data = await getCollaborators(tripId);
      setMembers(data);
    } catch {
      // ignore
    } finally {
      setMembersLoading(false);
    }
  };

  // Load members when entering the members step
  useEffect(() => {
    if (step === 3) loadMembers();
  }, [step]);

  const applyUnsplashPhoto = async (photo: UnsplashPhoto) => {
    setCoverImageUrl(photo.urls.regular);
    setCoverMode('unsplash');
    triggerDownload(photo);
    await update(tripId, {
      cover_image_url: photo.urls.regular,
      cover_image_attribution: `${photo.user.name}|${photo.user.links.html}|${photo.links.html}`,
      theme_color: photo.color || null,
    } as any);
  };

  const handleUnsplashToggle = async () => {
    if (unsplashLoading) return;

    if (coverMode === 'unsplash' && unsplashCache.current.length > 0) {
      unsplashIndex.current = (unsplashIndex.current + 1) % unsplashCache.current.length;
      await applyUnsplashPhoto(unsplashCache.current[unsplashIndex.current]);
      return;
    }

    const query = (destination || name).trim();
    if (!query) return;

    setUnsplashLoading(true);
    try {
      if (query !== lastQuery.current || unsplashCache.current.length === 0) {
        const results = await searchPhotos(query);
        unsplashCache.current = results;
        unsplashIndex.current = 0;
        lastQuery.current = query;
      }
      if (unsplashCache.current.length > 0) {
        unsplashIndex.current = Math.floor(Math.random() * unsplashCache.current.length);
        await applyUnsplashPhoto(unsplashCache.current[unsplashIndex.current]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUnsplashLoading(false);
    }
  };

  const handleClearCover = async () => {
    setCoverImageUrl(null);
    setCoverMode('none');
    unsplashCache.current = [];
    unsplashIndex.current = 0;
    await update(tripId, { cover_image_url: null, cover_image_attribution: null, theme_color: null } as any);
  };

  const handleDatePress = (day: DateData) => {
    if (!startDate || (startDate && endDate)) {
      setStartDate(day.dateString);
      setEndDate('');
    } else {
      if (day.dateString < startDate) {
        setStartDate(day.dateString);
      } else {
        setEndDate(day.dateString);
      }
    }
  };

  const getMarkedDates = () => {
    const marked: any = {};
    if (startDate) {
      marked[startDate] = { startingDay: true, color: colors.primary, textColor: '#fff' };
    }
    if (endDate) {
      marked[endDate] = { endingDay: true, color: colors.primary, textColor: '#fff' };
      const start = new Date(startDate);
      const end = new Date(endDate);
      const current = new Date(start);
      current.setDate(current.getDate() + 1);
      while (current < end) {
        marked[current.toISOString().split('T')[0]] = { color: colors.primaryLight, textColor: '#fff' };
        current.setDate(current.getDate() + 1);
      }
    }
    return marked;
  };

  const canNext = () => {
    if (step === 0) return name.trim() && destination.trim();
    if (step === 1) return startDate && endDate;
    return true;
  };

  const handleSave = async () => {
    if (!originalTrip) return;

    const datesChanged = startDate !== originalTrip.start_date || endDate !== originalTrip.end_date;

    if (datesChanged) {
      const oldDates = getDayDates(originalTrip.start_date, originalTrip.end_date);
      const newDates = getDayDates(startDate, endDate);
      const newDatesSet = new Set(newDates);
      const removedDates = oldDates.filter(d => !newDatesSet.has(d));

      if (removedDates.length > 0) {
        const existingDays = await getDays(tripId);
        const removedDays = existingDays.filter(d => removedDates.includes(d.date));

        let affectedActivities: { id: string; day_id: string }[] = [];
        for (const day of removedDays) {
          const acts = await getActivities(day.id);
          affectedActivities.push(...acts.map(a => ({ id: a.id, day_id: day.id })));
        }

        if (affectedActivities.length > 0) {
          return new Promise<void>((resolve) => {
            Alert.alert(
              'Aktivitäten betroffen',
              `${affectedActivities.length} Aktivität(en) liegen auf Tagen ausserhalb der neuen Datumsspanne.`,
              [
                { text: 'Abbrechen', style: 'cancel', onPress: () => resolve() },
                {
                  text: 'Löschen', style: 'destructive',
                  onPress: async () => {
                    for (const day of removedDays) await deleteDay(day.id);
                    await saveTrip();
                    resolve();
                  },
                },
                {
                  text: 'Verschieben',
                  onPress: async () => {
                    const allDays = await getDays(tripId);
                    const newFirstDate = newDates[0];
                    const newLastDate = newDates[newDates.length - 1];
                    for (const day of removedDays) {
                      const acts = await getActivities(day.id);
                      if (acts.length === 0) continue;
                      const targetDate = day.date < newFirstDate ? newFirstDate : newLastDate;
                      let targetDay = allDays.find(d => d.date === targetDate);
                      if (!targetDay) {
                        const { createDay } = await import('../../api/itineraries');
                        targetDay = await createDay(tripId, targetDate);
                      }
                      await moveActivitiesToDay(acts.map(a => a.id), targetDay.id);
                    }
                    for (const day of removedDays) await deleteDay(day.id);
                    await saveTrip();
                    resolve();
                  },
                },
              ],
            );
          });
        }
      }
    }

    await saveTrip();
  };

  const saveTrip = async () => {
    try {
      await update(tripId, {
        name: name.trim(),
        destination: destination.trim(),
        destination_lat: destinationLat,
        destination_lng: destinationLng,
        start_date: startDate,
        end_date: endDate,
        currency,
        notes: notes.trim() || null,
        fable_enabled: fableEnabled,
        fable_budget_visible: fableBudgetVisible,
        fable_packing_visible: fablePackingVisible,
        fable_web_search: fableWebSearch,
        fable_memory_enabled: fableMemoryEnabled,
      });
      navigation.goBack();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateInvite = async () => {
    if (!user) return;
    setInviteLoading(true);
    try {
      const { url } = await createInviteLink(tripId, user.id, 'collaborate', inviteRole);
      if (Platform.OS === 'web' && navigator.share) {
        try { await navigator.share({ title: name, url }); return; } catch {}
      }
      await Clipboard.setStringAsync(url);
      showToast('Einladungslink kopiert!', 'success');
    } catch {
      showToast('Fehler beim Erstellen', 'error');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRemoveMember = (member: CollaboratorWithProfile) => {
    const mName = getDisplayName(member.profile);
    const doRemove = async () => {
      try {
        await removeCollaborator(member.id);
        setMembers(prev => prev.filter(m => m.id !== member.id));
        showToast(`${mName} entfernt`, 'success');
      } catch { showToast('Fehler', 'error'); }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`${mName} wirklich entfernen?`)) {
        doRemove();
      }
    } else {
      Alert.alert('Teilnehmer entfernen', `${mName} wirklich entfernen?`, [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Entfernen', style: 'destructive', onPress: doRemove },
      ]);
    }
  };

  const handleToggleRole = async (member: CollaboratorWithProfile) => {
    const newRole = member.role === 'editor' ? 'viewer' : 'editor';
    try {
      await updateCollaboratorRole(member.id, newRole);
      setMembers(prev => prev.map(m => (m.id === member.id ? { ...m, role: newRole } : m)));
    } catch { showToast('Fehler', 'error'); }
  };

  if (loadingTrip) return (
    <View style={styles.container}>
      <Header title="Reise bearbeiten" onBack={() => navigation.goBack()} />
      <EditTripSkeleton />
    </View>
  );

  const owner = members.find(m => m.role === 'owner');
  const nonOwnerMembers = members.filter(m => m.role !== 'owner');
  const lastStep = steps.length - 1;

  return (
    <View style={styles.container}>
      <Header title="Reise bearbeiten" onBack={() => navigation.goBack()} />

      <View style={styles.progress}>
        {steps.map((s, i) => (
          <TouchableOpacity key={i} style={styles.progressItem} onPress={() => setStep(i)} activeOpacity={0.7}>
            <View style={[styles.progressDot, i <= step && styles.progressDotActive]}>
              <Text style={[styles.progressDotText, i <= step && styles.progressDotTextActive]}>{i + 1}</Text>
            </View>
            <Text style={[styles.progressLabel, i === step && styles.progressLabelActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {step === 0 && (
            <>
              <Text style={styles.stepTitle}>Reisedetails</Text>
              <Input label="Reisename" placeholder="z.B. Sommerferien 2026" value={name} onChangeText={setName} />
              <PlaceAutocomplete
                label="Reiseziel"
                placeholder="z.B. Barcelona, Spanien"
                value={destination}
                onChangeText={setDestination}
                onSelect={(place: PlaceResult) => {
                  setDestination(place.name);
                  setDestinationLat(place.lat);
                  setDestinationLng(place.lng);
                }}
              />
              <Text style={styles.fieldLabel}>Headerbild</Text>
              {coverImageUrl ? (
                <View style={styles.coverPicker}>
                  <Image source={{ uri: coverImageUrl }} style={styles.coverPreview} />
                  {unsplashLoading && (
                    <View style={styles.coverUploading}>
                      <ActivityIndicator color="#fff" />
                    </View>
                  )}
                </View>
              ) : (
                <View style={[styles.coverPicker, styles.coverPlaceholder]}>
                  <Text style={styles.coverPlaceholderIcon}>🌄</Text>
                  <Text style={styles.coverPlaceholderText}>Kein Bild (Farbverlauf)</Text>
                </View>
              )}
              <View style={styles.coverActions}>
                <TouchableOpacity
                  style={styles.coverActionBtn}
                  onPress={async () => {
                    const result = await ImagePicker.launchImageLibraryAsync({
                      mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [16, 9],
                    });
                    if (result.canceled) return;
                    setUploadingCover(true);
                    try {
                      const url = await uploadCoverImage(tripId, result.assets[0].uri);
                      setCoverImageUrl(url);
                      setCoverMode('upload');
                      const themeColor = await extractDominantColor(url).catch(() => null);
                      await update(tripId, { cover_image_url: url, cover_image_attribution: null, theme_color: themeColor } as any);
                    } catch { Alert.alert('Fehler', 'Bild konnte nicht hochgeladen werden'); }
                    finally { setUploadingCover(false); }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.coverActionIcon}>📷</Text>
                  <Text style={styles.coverActionText}>Eigenes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.coverActionBtn, coverMode === 'unsplash' && styles.coverActionBtnActive]}
                  onPress={handleUnsplashToggle}
                  disabled={unsplashLoading || !(destination || name).trim()}
                  activeOpacity={0.7}
                >
                  {unsplashLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={styles.coverActionIcon}>{coverMode === 'unsplash' ? '🔄' : '✨'}</Text>
                  )}
                  <Text style={styles.coverActionText}>{coverMode === 'unsplash' ? 'Nächstes' : 'Vorschlag'}</Text>
                </TouchableOpacity>
                {coverImageUrl && (
                  <TouchableOpacity style={styles.coverActionBtn} onPress={handleClearCover} activeOpacity={0.7}>
                    <Text style={styles.coverActionIcon}>✕</Text>
                    <Text style={[styles.coverActionText, { color: colors.error }]}>Standard</Text>
                  </TouchableOpacity>
                )}
              </View>
              {uploadingCover && <Text style={styles.uploadHint}>Wird hochgeladen...</Text>}
            </>
          )}

          {step === 1 && (
            <>
              <Text style={styles.stepTitle}>Reisedaten</Text>
              {startDate && (
                <Text style={styles.dateDisplay}>
                  {formatDate(startDate)}{endDate ? ` – ${formatDate(endDate)}` : ' – Enddatum wählen'}
                </Text>
              )}
              <Calendar
                onDayPress={handleDatePress}
                markingType="period"
                markedDates={getMarkedDates()}
                theme={{
                  todayTextColor: colors.primary, arrowColor: colors.primary,
                  textDayFontSize: 14, textMonthFontSize: 16, textDayHeaderFontSize: 12,
                }}
              />
            </>
          )}

          {step === 2 && (
            <>
              <Text style={styles.stepTitle}>Weitere Details</Text>
              <Text style={styles.fieldLabel}>Währung</Text>
              <View style={styles.currencyRow}>
                {CURRENCIES.map(c => (
                  <TouchableOpacity
                    key={c.code}
                    style={[styles.currencyChip, currency === c.code && styles.currencyChipActive]}
                    onPress={() => setCurrency(c.code)}
                  >
                    <Text style={[styles.currencyText, currency === c.code && styles.currencyTextActive]}>{c.code}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Input label="Notizen" placeholder="Optionale Notizen zur Reise..." value={notes} onChangeText={setNotes} multiline numberOfLines={3} style={{ height: 80, textAlignVertical: 'top' }} />

              <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Fable-Einstellungen</Text>
              <View style={styles.fableToggle}>
                <View style={styles.fableToggleInfo}>
                  <Text style={styles.fableToggleLabel}>Fable aktiviert</Text>
                  <Text style={styles.fableToggleDesc}>Fable für diese Reise ein-/ausschalten</Text>
                </View>
                <Switch value={fableEnabled} onValueChange={setFableEnabled} trackColor={{ false: colors.border, true: colors.secondary }} thumbColor="#FFFFFF" />
              </View>
              <View style={[styles.fableToggle, !fableEnabled && { opacity: 0.5 }]}>
                <View style={styles.fableToggleInfo}>
                  <Text style={styles.fableToggleLabel}>Budget sichtbar</Text>
                  <Text style={styles.fableToggleDesc}>Fable darf Budget-Daten sehen</Text>
                </View>
                <Switch value={fableBudgetVisible} onValueChange={setFableBudgetVisible} trackColor={{ false: colors.border, true: colors.secondary }} thumbColor="#FFFFFF" disabled={!fableEnabled} />
              </View>
              <View style={[styles.fableToggle, !fableEnabled && { opacity: 0.5 }]}>
                <View style={styles.fableToggleInfo}>
                  <Text style={styles.fableToggleLabel}>Packliste sichtbar</Text>
                  <Text style={styles.fableToggleDesc}>Fable darf Packlisten-Daten sehen</Text>
                </View>
                <Switch value={fablePackingVisible} onValueChange={setFablePackingVisible} trackColor={{ false: colors.border, true: colors.secondary }} thumbColor="#FFFFFF" disabled={!fableEnabled} />
              </View>
              <View style={[styles.fableToggle, !fableEnabled && { opacity: 0.5 }]}>
                <View style={styles.fableToggleInfo}>
                  <Text style={styles.fableToggleLabel}>Web-Suche erlaubt</Text>
                  <Text style={styles.fableToggleDesc}>Fable darf im Web suchen</Text>
                </View>
                <Switch value={fableWebSearch} onValueChange={setFableWebSearch} trackColor={{ false: colors.border, true: colors.secondary }} thumbColor="#FFFFFF" disabled={!fableEnabled} />
              </View>
              <View style={[styles.fableToggle, !fableEnabled && { opacity: 0.5 }]}>
                <View style={styles.fableToggleInfo}>
                  <Text style={styles.fableToggleLabel}>Trip-Erinnerungen</Text>
                  <Text style={styles.fableToggleDesc}>Fable darf sich Gespraechsinhalte merken</Text>
                </View>
                <Switch value={fableMemoryEnabled} onValueChange={setFableMemoryEnabled} trackColor={{ false: colors.border, true: colors.secondary }} thumbColor="#FFFFFF" disabled={!fableEnabled} />
              </View>
            </>
          )}

          {step === 3 && (
            <>
              <Text style={styles.stepTitle}>Teilnehmer</Text>

              {/* Invite */}
              <Text style={styles.fieldLabel}>Einladen als</Text>
              <View style={styles.inviteRow}>
                <View style={styles.roleToggle}>
                  <TouchableOpacity
                    style={[styles.roleBtn, inviteRole === 'viewer' && styles.roleBtnActive]}
                    onPress={() => setInviteRole('viewer')}
                  >
                    <Text style={[styles.roleBtnText, inviteRole === 'viewer' && styles.roleBtnTextActive]}>Betrachter</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.roleBtn, inviteRole === 'editor' && styles.roleBtnActive]}
                    onPress={() => setInviteRole('editor')}
                  >
                    <Text style={[styles.roleBtnText, inviteRole === 'editor' && styles.roleBtnTextActive]}>Bearbeiter</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.inviteBtn} onPress={handleCreateInvite} disabled={inviteLoading}>
                  {inviteLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.inviteBtnText}>Link kopieren</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Members list */}
              {membersLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
              ) : (
                <>
                  {owner && (
                    <View style={styles.memberRow}>
                      <Avatar uri={owner.profile.avatar_url} name={getDisplayName(owner.profile)} size={36} />
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName} numberOfLines={1}>{getDisplayName(owner.profile)}</Text>
                        <Text style={styles.memberRole}>{roleLabels.owner}</Text>
                      </View>
                    </View>
                  )}
                  {nonOwnerMembers.map(member => (
                    <View key={member.id} style={styles.memberRow}>
                      <Avatar uri={member.profile.avatar_url} name={getDisplayName(member.profile)} size={36} />
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName} numberOfLines={1}>{getDisplayName(member.profile)}</Text>
                        <TouchableOpacity onPress={() => handleToggleRole(member)}>
                          <Text style={styles.memberRoleTappable}>{roleLabels[member.role] || member.role}  ↻</Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity onPress={() => handleRemoveMember(member)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={styles.removeMember}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  {nonOwnerMembers.length === 0 && (
                    <Text style={styles.emptyMembers}>Noch keine Teilnehmer eingeladen.</Text>
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        {step > 0 && <Button title="Zurück" onPress={() => setStep(s => s - 1)} variant="ghost" style={styles.footerButton} />}
        {step < lastStep ? (
          <>
            <Button title="Speichern" onPress={handleSave} loading={saving} disabled={!name.trim() || !destination.trim() || !startDate || !endDate} variant="secondary" style={styles.footerButton} />
            <Button title="Weiter" onPress={() => setStep(s => s + 1)} disabled={!canNext()} style={[styles.footerButton, styles.footerNext]} />
          </>
        ) : (
          <Button title="Speichern" onPress={handleSave} loading={saving} disabled={!canNext()} style={[styles.footerButton, styles.footerNext]} />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  progress: { flexDirection: 'row', justifyContent: 'center', padding: spacing.md, gap: spacing.lg },
  progressItem: { alignItems: 'center' },
  progressDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  progressDotActive: { backgroundColor: colors.primary },
  progressDotText: { ...typography.bodySmall, fontWeight: '600', color: colors.textLight },
  progressDotTextActive: { color: '#FFFFFF' },
  progressLabel: { ...typography.caption, marginTop: 4 },
  progressLabelActive: { color: colors.primary, fontWeight: '600' },
  content: { padding: spacing.xl },
  stepTitle: { ...typography.h2, marginBottom: spacing.lg },
  dateDisplay: { ...typography.body, color: colors.primary, fontWeight: '600', marginBottom: spacing.md, textAlign: 'center' },
  fieldLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  currencyRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  currencyChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.full, borderWidth: 1.5, borderColor: colors.border },
  currencyChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  currencyText: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  currencyTextActive: { color: '#FFFFFF' },
  coverPicker: { borderRadius: borderRadius.lg, overflow: 'hidden', marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  coverPreview: { width: '100%', height: 160 },
  coverPlaceholder: { height: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  coverPlaceholderIcon: { fontSize: 32, marginBottom: spacing.xs },
  coverPlaceholderText: { ...typography.bodySmall, color: colors.textLight },
  coverUploading: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  coverActions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  coverActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  coverActionBtnActive: { borderColor: colors.primary },
  coverActionIcon: { fontSize: 16 },
  coverActionText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  uploadHint: { ...typography.caption, color: colors.textLight, marginBottom: spacing.sm },
  // Members step
  inviteRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, alignItems: 'center' },
  roleToggle: { flex: 1, flexDirection: 'row', gap: spacing.xs },
  roleBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  roleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  roleBtnText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  roleBtnTextActive: { color: '#FFFFFF' },
  inviteBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, justifyContent: 'center' },
  inviteBtnText: { color: '#FFFFFF', ...typography.caption, fontWeight: '600' },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  memberInfo: { flex: 1, marginLeft: spacing.sm },
  memberName: { ...typography.body, fontWeight: '500' },
  memberRole: { ...typography.caption, color: colors.textLight },
  memberRoleTappable: { ...typography.caption, color: colors.primary },
  removeMember: { fontSize: 16, color: colors.error, padding: spacing.xs },
  emptyMembers: { ...typography.bodySmall, color: colors.textLight, textAlign: 'center', marginTop: spacing.lg },
  fableToggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  fableToggleInfo: { flex: 1, marginRight: spacing.md },
  fableToggleLabel: { ...typography.bodySmall, fontWeight: '600', marginBottom: 2 },
  fableToggleDesc: { ...typography.caption, color: colors.textSecondary },
  footer: { flexDirection: 'row', padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  footerButton: { flex: 1 },
  footerNext: { marginLeft: spacing.sm },
});
