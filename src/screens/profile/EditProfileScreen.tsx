import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Avatar, Button } from '../../components/common';
import { useAuth } from '../../hooks/useAuth';
import { updateProfile } from '../../api/auth';
import { supabase } from '../../api/supabase';
import { useToast } from '../../contexts/ToastContext';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

type Props = { navigation: NativeStackNavigationProp<any> };

export const EditProfileScreen: React.FC<Props> = ({ navigation }) => {
  const { user, profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null);
  const [saving, setSaving] = useState(false);

  const resizeForWeb = async (uri: string, maxSize: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, maxSize, maxSize);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
          'image/jpeg',
          0.7,
        );
      };
      img.onerror = reject;
      img.src = uri;
    });
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    const path = `${user!.id}.jpg`;

    try {
      let body: any;
      if (Platform.OS === 'web') {
        body = await resizeForWeb(uri, 200);
      } else {
        body = { uri, type: 'image/jpeg', name: 'avatar.jpg' } as any;
      }

      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, body, { upsert: true, contentType: 'image/jpeg' });
      if (error) throw error;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      setAvatarUrl(urlData.publicUrl + '?t=' + Date.now());
    } catch {
      showToast('Bild-Upload fehlgeschlagen', 'error');
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const updates: { full_name?: string; avatar_url?: string } = {};
      if (fullName !== profile?.full_name) updates.full_name = fullName;
      if (avatarUrl !== profile?.avatar_url) updates.avatar_url = avatarUrl || undefined;

      if (Object.keys(updates).length > 0) {
        await updateProfile(user.id, updates);
        await refreshProfile();
      }
      showToast('Profil gespeichert', 'success');
      navigation.goBack();
    } catch {
      showToast('Speichern fehlgeschlagen', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>← Zurück</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Profil bearbeiten</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.avatarSection}>
        <TouchableOpacity onPress={pickImage}>
          <Avatar uri={avatarUrl} name={fullName || user?.email || ''} size={100} />
          <View style={styles.cameraOverlay}>
            <Text style={styles.cameraIcon}>📷</Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.changePhotoText}>Foto ändern</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Dein Name"
          placeholderTextColor={colors.textLight}
        />

        <Text style={styles.label}>E-Mail</Text>
        <TextInput
          style={[styles.input, styles.inputDisabled]}
          value={user?.email || ''}
          editable={false}
        />
      </View>

      <Button
        title="Speichern"
        onPress={handleSave}
        loading={saving}
        style={styles.saveBtn}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: { ...typography.body, color: colors.primary },
  title: { ...typography.h3, textAlign: 'center' },
  avatarSection: { alignItems: 'center', marginVertical: spacing.xl },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary,
    borderRadius: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraIcon: { fontSize: 16 },
  changePhotoText: { ...typography.bodySmall, color: colors.primary, marginTop: spacing.sm },
  form: { paddingHorizontal: spacing.xl },
  label: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    ...typography.body,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    outlineStyle: 'none' as any,
  },
  inputDisabled: { backgroundColor: colors.background, color: colors.textLight },
  saveBtn: { marginHorizontal: spacing.xl, marginTop: spacing.xl },
});
