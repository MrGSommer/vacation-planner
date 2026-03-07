# Slideshow Sharing with Music — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users share photo slideshows with background music as a public web link (no auth needed for viewers), and add music to the in-app slideshow.

**Architecture:** New `slideshow_shares` DB table stores config + token. Edge Function `get-slideshow` returns photo URLs + config for public access. `SlideshowViewScreen` renders the public slideshow (placed outside auth conditional like `TripShare`). In-app slideshow gets music via `expo-av`. `SlideshowShareModal` handles configuration + link creation.

**Tech Stack:** expo-av (audio), Supabase Storage (music bucket), Edge Function (Deno), React Native Animated (transitions)

---

### Task 1: Install expo-av

**Files:**
- Modify: `package.json`

**Step 1: Install expo-av**

Run: `npx expo install expo-av`

**Step 2: Verify installation**

Run: `npx expo config --type public | grep -i "expo-av"` or check package.json manually.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install expo-av for slideshow music playback"
```

---

### Task 2: DB Migration — slideshow_shares table

**Files:**
- Create: `supabase/migrations/20260307120000_slideshow_shares.sql`

**Step 1: Write migration**

```sql
-- Slideshow sharing with music
CREATE TABLE slideshow_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  music_track TEXT NOT NULL DEFAULT 'relaxed' CHECK (music_track IN ('relaxed', 'adventure', 'romantic', 'festive')),
  interval_ms INTEGER NOT NULL DEFAULT 4000 CHECK (interval_ms IN (3000, 4000, 6000)),
  photo_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  trip_name TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_slideshow_shares_token ON slideshow_shares(token);
CREATE INDEX idx_slideshow_shares_trip ON slideshow_shares(trip_id);

ALTER TABLE slideshow_shares ENABLE ROW LEVEL SECURITY;

-- Authenticated users can create/read for their own trips
CREATE POLICY "slideshow_shares_insert" ON slideshow_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND trip_id IN (
      SELECT id FROM trips WHERE created_by = auth.uid()
      UNION
      SELECT trip_id FROM trip_collaborators WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "slideshow_shares_select" ON slideshow_shares
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR trip_id IN (
      SELECT id FROM trips WHERE created_by = auth.uid()
      UNION
      SELECT trip_id FROM trip_collaborators WHERE user_id = auth.uid()
    )
  );

-- Public access via Edge Function (service role), no direct anon access
```

**Step 2: Apply migration**

Use Supabase MCP tool `apply_migration` or run: `npx supabase db push`

**Step 3: Commit**

```bash
git add supabase/migrations/20260307120000_slideshow_shares.sql
git commit -m "feat: add slideshow_shares table with token + music config"
```

---

### Task 3: Upload music tracks to Supabase Storage

**Files:**
- Create: `assets/music/` (local reference, tracks uploaded to Supabase Storage)

**Step 1: Source 4 royalty-free MP3 tracks**

Download from Pixabay Music (royalty-free, no attribution required):
- `relaxed.mp3` — calm acoustic/ambient (~2-3 min, ~2-3 MB)
- `adventure.mp3` — upbeat energetic (~2-3 min, ~2-3 MB)
- `romantic.mp3` — soft piano/strings (~2-3 min, ~2-3 MB)
- `festive.mp3` — happy lively (~2-3 min, ~2-3 MB)

Save to `assets/music/` for reference.

**Step 2: Create Supabase Storage bucket `music`**

Via Supabase Dashboard or SQL:
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('music', 'music', true);
```

**Step 3: Upload tracks to bucket**

Upload via Supabase Dashboard: `music/relaxed.mp3`, `music/adventure.mp3`, `music/romantic.mp3`, `music/festive.mp3`.

Public URLs will be: `https://ogwccvzyhljxwtcbjbsd.supabase.co/storage/v1/object/public/music/relaxed.mp3`

**Step 4: Create music config**

Create file `src/config/music.ts`:

```typescript
const STORAGE_BASE = 'https://ogwccvzyhljxwtcbjbsd.supabase.co/storage/v1/object/public/music';

export type MusicTrack = 'relaxed' | 'adventure' | 'romantic' | 'festive';

export interface MusicTrackInfo {
  id: MusicTrack;
  label: string;
  description: string;
  url: string;
  icon: string; // Ionicon name
}

export const MUSIC_TRACKS: MusicTrackInfo[] = [
  { id: 'relaxed', label: 'Entspannt', description: 'Ruhig & akustisch', url: `${STORAGE_BASE}/relaxed.mp3`, icon: 'leaf-outline' },
  { id: 'adventure', label: 'Abenteuer', description: 'Energisch & upbeat', url: `${STORAGE_BASE}/adventure.mp3`, icon: 'compass-outline' },
  { id: 'romantic', label: 'Romantisch', description: 'Sanft & Piano', url: `${STORAGE_BASE}/romantic.mp3`, icon: 'heart-outline' },
  { id: 'festive', label: 'Festlich', description: 'Froehlich & lebhaft', url: `${STORAGE_BASE}/festive.mp3`, icon: 'musical-notes-outline' },
];

export const getMusicUrl = (track: MusicTrack): string =>
  MUSIC_TRACKS.find(t => t.id === track)?.url || MUSIC_TRACKS[0].url;
```

**Step 5: Commit**

```bash
git add src/config/music.ts
git commit -m "feat: add music track config for slideshow"
```

---

### Task 4: API functions — slideshow shares

**Files:**
- Create: `src/api/slideshows.ts`

**Step 1: Write API functions**

```typescript
import { supabase } from './supabase';
import { MusicTrack } from '../config/music';

export interface SlideshowShare {
  id: string;
  trip_id: string;
  created_by: string;
  token: string;
  music_track: MusicTrack;
  interval_ms: number;
  photo_ids: string[];
  trip_name: string | null;
  expires_at: string;
  created_at: string;
}

export interface SlideshowShareData {
  music_track: MusicTrack;
  interval_ms: number;
  trip_name: string | null;
  photos: { url: string }[];
  music_url: string;
  expires_at: string;
}

/** Create a new slideshow share link */
export const createSlideshowShare = async (params: {
  tripId: string;
  musicTrack: MusicTrack;
  intervalMs: number;
  photoIds: string[];
  tripName: string | null;
}): Promise<SlideshowShare> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');

  const { data, error } = await supabase
    .from('slideshow_shares')
    .insert({
      trip_id: params.tripId,
      created_by: user.id,
      music_track: params.musicTrack,
      interval_ms: params.intervalMs,
      photo_ids: params.photoIds,
      trip_name: params.tripName,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

/** Fetch public slideshow data via Edge Function (no auth required) */
export const getSharedSlideshow = async (token: string): Promise<SlideshowShareData> => {
  const { data, error } = await supabase.functions.invoke('get-slideshow', {
    body: { token },
  });
  if (error) throw new Error(error.message || 'Diashow nicht gefunden');
  if (data?.error) throw new Error(data.error);
  return data;
};
```

**Step 2: Commit**

```bash
git add src/api/slideshows.ts
git commit -m "feat: add slideshow share API functions"
```

---

### Task 5: Edge Function — get-slideshow

**Files:**
- Create: `supabase/functions/get-slideshow/index.ts`

**Step 1: Write Edge Function**

This function is called by both the in-app share flow AND the public slideshow page. It uses the service role to bypass RLS, validates the token, checks expiry, and returns signed photo URLs + music URL.

```typescript
import { corsHeaders, json } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...corsHeaders(origin), 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
  }

  try {
    const { token } = await req.json();
    if (!token) return json({ error: 'Token fehlt' }, origin, 400);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Fetch slideshow share by token
    const shareRes = await fetch(
      `${SUPABASE_URL}/rest/v1/slideshow_shares?token=eq.${token}&select=*`,
      {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );
    const shares = await shareRes.json();
    if (!shares || shares.length === 0) {
      return json({ error: 'Diashow nicht gefunden' }, origin, 404);
    }

    const share = shares[0];

    // Check expiry
    if (new Date(share.expires_at) < new Date()) {
      return json({ error: 'Dieser Diashow-Link ist abgelaufen' }, origin, 410);
    }

    // Fetch photo URLs from trip_photos table
    const photoIds = share.photo_ids as string[];
    if (photoIds.length === 0) {
      return json({ error: 'Keine Fotos in dieser Diashow' }, origin, 404);
    }

    // Fetch photos in order
    const photosRes = await fetch(
      `${SUPABASE_URL}/rest/v1/trip_photos?id=in.(${photoIds.map(id => `"${id}"`).join(',')})&select=id,url`,
      {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );
    const photos = await photosRes.json();

    // Sort photos in the order specified by photo_ids
    const photoMap = new Map(photos.map((p: any) => [p.id, p]));
    const orderedPhotos = photoIds
      .map(id => photoMap.get(id))
      .filter(Boolean)
      .map((p: any) => ({ url: p.url }));

    // Build music URL
    const musicUrl = `${SUPABASE_URL}/storage/v1/object/public/music/${share.music_track}.mp3`;

    return json({
      music_track: share.music_track,
      interval_ms: share.interval_ms,
      trip_name: share.trip_name,
      photos: orderedPhotos,
      music_url: musicUrl,
      expires_at: share.expires_at,
    }, origin);
  } catch (e) {
    return json({ error: 'Interner Fehler' }, origin, 500);
  }
});
```

**Step 2: Deploy**

Run: `npx supabase functions deploy get-slideshow --no-verify-jwt`

**Step 3: Commit**

```bash
git add supabase/functions/get-slideshow/index.ts
git commit -m "feat: add get-slideshow Edge Function for public slideshow access"
```

---

### Task 6: SlideshowShareModal component

**Files:**
- Create: `src/components/photos/SlideshowShareModal.tsx`

**Step 1: Write the modal**

Modal with:
- Music track selection (4 cards with icon + label, play preview via expo-av)
- Speed selector (3s / 4s / 6s segmented control)
- Photo count info
- "Link erstellen" button
- After creation: show link + Copy + Share buttons

Key implementation details:
- Use `Audio.Sound` from `expo-av` for music preview (load, play 5s preview, unload)
- Use `Clipboard` from `expo-clipboard` or `navigator.clipboard` for copy
- Use `Share` from `react-native` or `navigator.share` for native share
- Call `createSlideshowShare()` API function
- Build share URL: `https://wayfable.ch/slideshow/${token}`

```typescript
import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator,
  Platform, Share as RNShare,
} from 'react-native';
import { Audio } from 'expo-av';
import { Icon } from '../../utils/icons';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { MUSIC_TRACKS, MusicTrack } from '../../config/music';
import { createSlideshowShare } from '../../api/slideshows';

interface Props {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  tripName: string;
  photoIds: string[];
}

const SPEEDS = [
  { label: '3s', value: 3000 },
  { label: '4s', value: 4000 },
  { label: '6s', value: 6000 },
];

export const SlideshowShareModal: React.FC<Props> = ({
  visible, onClose, tripId, tripName, photoIds,
}) => {
  const [selectedTrack, setSelectedTrack] = useState<MusicTrack>('relaxed');
  const [intervalMs, setIntervalMs] = useState(4000);
  const [creating, setCreating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [previewingTrack, setPreviewingTrack] = useState<MusicTrack | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const stopPreview = useCallback(async () => {
    if (soundRef.current) {
      try { await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }
    setPreviewingTrack(null);
  }, []);

  const togglePreview = useCallback(async (track: MusicTrack) => {
    await stopPreview();
    if (previewingTrack === track) return; // was playing, now stopped

    const info = MUSIC_TRACKS.find(t => t.id === track);
    if (!info) return;
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: info.url },
        { shouldPlay: true, volume: 0.5 }
      );
      soundRef.current = sound;
      setPreviewingTrack(track);
      // Auto-stop after 8s
      setTimeout(() => stopPreview(), 8000);
    } catch {}
  }, [previewingTrack, stopPreview]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const share = await createSlideshowShare({
        tripId,
        musicTrack: selectedTrack,
        intervalMs,
        photoIds,
        tripName,
      });
      setShareUrl(`https://wayfable.ch/slideshow/${share.token}`);
    } catch (e) {
      if (Platform.OS === 'web') {
        window.alert('Link konnte nicht erstellt werden');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    if (Platform.OS === 'web' && navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!shareUrl) return;
    if (Platform.OS === 'web' && navigator.share) {
      await navigator.share({ title: `${tripName} — Diashow`, url: shareUrl });
    } else {
      await RNShare.share({ message: shareUrl, title: `${tripName} — Diashow` });
    }
  };

  const handleClose = () => {
    stopPreview();
    setShareUrl(null);
    setCopied(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Diashow teilen</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {!shareUrl ? (
            <>
              {/* Music selection */}
              <Text style={styles.sectionTitle}>Musik</Text>
              <View style={styles.trackGrid}>
                {MUSIC_TRACKS.map(track => (
                  <TouchableOpacity
                    key={track.id}
                    style={[styles.trackCard, selectedTrack === track.id && styles.trackCardActive]}
                    onPress={() => { setSelectedTrack(track.id); togglePreview(track.id); }}
                    activeOpacity={0.7}
                  >
                    <Icon
                      name={track.icon as any}
                      size={24}
                      color={selectedTrack === track.id ? colors.primary : colors.textSecondary}
                    />
                    <Text style={[styles.trackLabel, selectedTrack === track.id && styles.trackLabelActive]}>
                      {track.label}
                    </Text>
                    <Text style={styles.trackDesc}>{track.description}</Text>
                    {previewingTrack === track.id && (
                      <View style={styles.playingIndicator}>
                        <Icon name="volume-high-outline" size={14} color={colors.primary} />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Speed selection */}
              <Text style={styles.sectionTitle}>Geschwindigkeit</Text>
              <View style={styles.speedRow}>
                {SPEEDS.map(s => (
                  <TouchableOpacity
                    key={s.value}
                    style={[styles.speedBtn, intervalMs === s.value && styles.speedBtnActive]}
                    onPress={() => setIntervalMs(s.value)}
                  >
                    <Text style={[styles.speedText, intervalMs === s.value && styles.speedTextActive]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Info */}
              <Text style={styles.infoText}>
                {photoIds.length} Fotos · Link 30 Tage gueltig
              </Text>

              {/* Create button */}
              <TouchableOpacity style={styles.createBtn} onPress={handleCreate} disabled={creating}>
                {creating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.createBtnText}>Link erstellen</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            /* Link created */
            <>
              <View style={styles.successIcon}>
                <Icon name="checkmark-circle" size={48} color={colors.success} />
              </View>
              <Text style={styles.successText}>Diashow-Link erstellt!</Text>
              <View style={styles.linkBox}>
                <Text style={styles.linkText} numberOfLines={1}>{shareUrl}</Text>
              </View>
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={handleCopy}>
                  <Icon name={copied ? 'checkmark' : 'copy-outline'} size={20} color={colors.primary} />
                  <Text style={styles.actionBtnText}>{copied ? 'Kopiert!' : 'Kopieren'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={handleShare}>
                  <Icon name="share-outline" size={20} color="#fff" />
                  <Text style={[styles.actionBtnText, { color: '#fff' }]}>Teilen</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: colors.card, borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl, padding: spacing.lg,
    paddingBottom: Platform.OS === 'web' ? spacing.xl : 40,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.h3, fontWeight: '700' },
  sectionTitle: {
    ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  trackGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  trackCard: {
    width: '47%', padding: spacing.md, borderRadius: borderRadius.md,
    backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', gap: 4,
  },
  trackCardActive: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  trackLabel: { ...typography.bodySmall, fontWeight: '600' },
  trackLabelActive: { color: colors.primary },
  trackDesc: { ...typography.caption, color: colors.textSecondary },
  playingIndicator: { position: 'absolute', top: 6, right: 6 },
  speedRow: { flexDirection: 'row', gap: spacing.sm },
  speedBtn: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.md,
    backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center',
  },
  speedBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  speedText: { ...typography.body, fontWeight: '600' },
  speedTextActive: { color: colors.primary },
  infoText: {
    ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center',
    marginTop: spacing.lg,
  },
  createBtn: {
    backgroundColor: colors.primary, paddingVertical: spacing.md,
    borderRadius: borderRadius.md, alignItems: 'center', marginTop: spacing.md,
  },
  createBtnText: { ...typography.body, color: '#fff', fontWeight: '700' },
  successIcon: { alignItems: 'center', marginTop: spacing.lg },
  successText: {
    ...typography.h3, fontWeight: '700', textAlign: 'center', marginTop: spacing.sm,
  },
  linkBox: {
    backgroundColor: colors.background, padding: spacing.md,
    borderRadius: borderRadius.md, marginTop: spacing.lg,
  },
  linkText: { ...typography.bodySmall, color: colors.text },
  actionRow: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, paddingVertical: spacing.md, borderRadius: borderRadius.md,
    backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border,
  },
  actionBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionBtnText: { ...typography.bodySmall, fontWeight: '600' },
});
```

**Step 2: Commit**

```bash
git add src/components/photos/SlideshowShareModal.tsx
git commit -m "feat: add SlideshowShareModal with music selection and link creation"
```

---

### Task 7: SlideshowViewScreen — public slideshow page

**Files:**
- Create: `src/screens/slideshow/SlideshowViewScreen.tsx`
- Modify: `src/types/navigation.ts` — add `SlideshowView` route
- Modify: `src/navigation/AppNavigator.tsx` — add screen + linking

**Step 1: Add route type**

In `src/types/navigation.ts`, add to `RootStackParamList`:
```typescript
SlideshowView: { token: string };
```

**Step 2: Write the screen**

`src/screens/slideshow/SlideshowViewScreen.tsx`:

Fullscreen black background. Loads slideshow data via `getSharedSlideshow(token)`. Shows:
- Fade transitions between photos (reuse Animated pattern from PhotosScreen)
- Background music via `expo-av` Audio (loop, autoplay after user tap)
- Progress bar at top
- Small WayFable logo bottom-left
- Play/Pause + Mute buttons (minimal, translucent)
- At the end of cycle: CTA overlay "Plane deine eigene Reise mit WayFable" + link to wayfable.ch
- Tap anywhere to start (browser autoplay policy requires user interaction)

Key implementation:
- On mount: call `getSharedSlideshow(token)`
- On error/expired: show message with link to wayfable.ch
- Music: `Audio.Sound.createAsync({ uri: music_url }, { shouldPlay: false, isLooping: true })`
- Start screen: dark overlay with play button + trip name, tap to start slideshow + music
- Photo preloading: use `Image.prefetch()` for next 2 photos
- CTA at end: after one full cycle through all photos, show CTA overlay (user can dismiss to continue loop)

```typescript
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator,
  Dimensions, Platform, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { Audio } from 'expo-av';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../types/navigation';
import { getSharedSlideshow, SlideshowShareData } from '../../api/slideshows';
import { getMusicUrl } from '../../config/music';
import { Icon } from '../../utils/icons';
import { colors, spacing, typography, borderRadius } from '../../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SlideshowView'>;

const { width, height } = Dimensions.get('window');

export const SlideshowViewScreen: React.FC<Props> = ({ route }) => {
  const { token } = route.params;
  const [data, setData] = useState<SlideshowShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showCta, setShowCta] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const soundRef = useRef<Audio.Sound | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load slideshow data
  useEffect(() => {
    (async () => {
      try {
        const result = await getSharedSlideshow(token);
        setData(result);
      } catch (e: any) {
        setError(e.message || 'Diashow nicht gefunden');
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      if (soundRef.current) soundRef.current.unloadAsync();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token]);

  // Start slideshow + music
  const handleStart = useCallback(async () => {
    if (!data) return;
    // Init audio
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: data.music_url },
        { shouldPlay: true, isLooping: true, volume: 0.6 }
      );
      soundRef.current = sound;
    } catch {}
    setStarted(true);
  }, [data]);

  // Advance slideshow
  const advance = useCallback(() => {
    if (!data) return;
    Animated.timing(fadeAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
      setPhotoIndex(prev => {
        const next = prev + 1;
        if (next >= data.photos.length) {
          setCycleCount(c => c + 1);
          setShowCta(true);
          return 0;
        }
        return next;
      });
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    });
  }, [data, fadeAnim]);

  // Run interval
  useEffect(() => {
    if (!started || !data || paused || showCta) return;
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 1, duration: data.interval_ms, useNativeDriver: false,
    }).start();
    intervalRef.current = setInterval(() => {
      advance();
      progressAnim.setValue(0);
      Animated.timing(progressAnim, {
        toValue: 1, duration: data.interval_ms, useNativeDriver: false,
      }).start();
    }, data.interval_ms);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [started, data, paused, showCta, advance, progressAnim]);

  // Toggle mute
  const toggleMute = async () => {
    if (soundRef.current) {
      await soundRef.current.setIsMutedAsync(!muted);
      setMuted(!muted);
    }
  };

  // Toggle pause
  const togglePause = async () => {
    if (paused) {
      soundRef.current?.playAsync();
    } else {
      soundRef.current?.pauseAsync();
    }
    setPaused(!paused);
  };

  // Dismiss CTA
  const dismissCta = () => {
    setShowCta(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <Icon name="sad-outline" size={48} color="rgba(255,255,255,0.5)" />
        <Text style={styles.errorText}>{error || 'Diashow nicht gefunden'}</Text>
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => Linking.openURL('https://wayfable.ch')}
        >
          <Text style={styles.ctaButtonText}>Zu WayFable</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Start screen
  if (!started) {
    return (
      <TouchableOpacity style={styles.center} onPress={handleStart} activeOpacity={0.9}>
        <Icon name="play-circle-outline" size={72} color="rgba(255,255,255,0.8)" />
        {data.trip_name && (
          <Text style={styles.tripNameStart}>{data.trip_name}</Text>
        )}
        <Text style={styles.tapHint}>Antippen zum Starten</Text>
        <Text style={styles.photoCount}>{data.photos.length} Fotos</Text>
      </TouchableOpacity>
    );
  }

  // CTA overlay
  if (showCta) {
    return (
      <View style={styles.center}>
        <Text style={styles.ctaTitle}>Plane deine eigene Reise</Text>
        <Text style={styles.ctaSubtitle}>mit WayFable</Text>
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => Linking.openURL('https://wayfable.ch')}
        >
          <Text style={styles.ctaButtonText}>Jetzt entdecken</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={dismissCta} style={styles.ctaDismiss}>
          <Text style={styles.ctaDismissText}>Diashow fortsetzen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Slideshow
  const photo = data.photos[photoIndex];

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, {
          width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }]} />
      </View>

      {/* Photo */}
      <Animated.View style={[styles.photoContainer, { opacity: fadeAnim }]}>
        <Image source={photo.url} style={styles.photo} contentFit="contain" transition={300} />
      </Animated.View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlBtn} onPress={togglePause}>
          <Icon name={paused ? 'play' : 'pause'} size={20} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlBtn} onPress={toggleMute}>
          <Icon name={muted ? 'volume-mute' : 'volume-high'} size={20} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
      </View>

      {/* Counter */}
      <Text style={styles.counter}>{photoIndex + 1} / {data.photos.length}</Text>

      {/* Logo */}
      <Text style={styles.logo}>WayFable</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center',
    padding: spacing.xl,
  },
  progressTrack: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
    backgroundColor: 'rgba(255,255,255,0.15)', zIndex: 10,
  },
  progressFill: { height: '100%', backgroundColor: colors.primary },
  photoContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  photo: { width: '100%', height: '100%' },
  controls: {
    position: 'absolute', bottom: Platform.OS === 'web' ? spacing.lg : 40,
    right: spacing.lg, flexDirection: 'row', gap: spacing.sm,
  },
  controlBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  counter: {
    position: 'absolute', top: spacing.lg, right: spacing.lg,
    ...typography.caption, color: 'rgba(255,255,255,0.5)',
  },
  logo: {
    position: 'absolute', bottom: Platform.OS === 'web' ? spacing.lg : 40,
    left: spacing.lg, ...typography.caption, color: 'rgba(255,255,255,0.3)',
    fontWeight: '700', letterSpacing: 1,
  },
  errorText: {
    ...typography.body, color: 'rgba(255,255,255,0.7)', textAlign: 'center',
    marginTop: spacing.md,
  },
  tripNameStart: {
    ...typography.h2, color: '#fff', fontWeight: '700', marginTop: spacing.lg,
    textAlign: 'center',
  },
  tapHint: {
    ...typography.body, color: 'rgba(255,255,255,0.5)', marginTop: spacing.sm,
  },
  photoCount: {
    ...typography.caption, color: 'rgba(255,255,255,0.3)', marginTop: spacing.xs,
  },
  ctaTitle: { ...typography.h2, color: '#fff', fontWeight: '700', textAlign: 'center' },
  ctaSubtitle: {
    ...typography.h3, color: colors.primary, fontWeight: '600', marginTop: spacing.xs,
  },
  ctaButton: {
    backgroundColor: colors.primary, paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md, borderRadius: borderRadius.md, marginTop: spacing.xl,
  },
  ctaButtonText: { ...typography.body, color: '#fff', fontWeight: '700' },
  ctaDismiss: { marginTop: spacing.lg },
  ctaDismissText: { ...typography.bodySmall, color: 'rgba(255,255,255,0.4)' },
});
```

**Step 3: Add to AppNavigator**

In `src/navigation/AppNavigator.tsx`:

Add import:
```typescript
import { SlideshowViewScreen } from '../screens/slideshow/SlideshowViewScreen';
```

Add to linking config (inside `config.screens`):
```typescript
SlideshowView: 'slideshow/:token',
```

Add screen OUTSIDE auth conditional (next to TripShare, line 231):
```typescript
<Stack.Screen name="SlideshowView" component={SlideshowViewScreen} />
```

Add slideshow path handling in the deep link useEffect (line 111-128), add before the generic path check:
```typescript
const slideshowMatch = path.match(/^\/slideshow\/(.+)$/);
if (slideshowMatch) {
  // Slideshow is public — don't require auth, let linking handle it
  return;
}
```

**Step 4: Commit**

```bash
git add src/screens/slideshow/SlideshowViewScreen.tsx src/types/navigation.ts src/navigation/AppNavigator.tsx
git commit -m "feat: add public SlideshowViewScreen with music + CTA"
```

---

### Task 8: PhotosScreen integration — music + share state

**Files:**
- Modify: `src/screens/trip/PhotosScreen.tsx`

**Step 1: Add music to in-app slideshow**

Import and integrate:
```typescript
import { Audio } from 'expo-av';
import { MUSIC_TRACKS, MusicTrack } from '../../config/music';
```

Add state:
```typescript
const [slideshowMusic, setSlideshowMusic] = useState<MusicTrack>('relaxed');
const slideshowSoundRef = useRef<Audio.Sound | null>(null);
```

When `slideshowActive` becomes true (in the existing useEffect), also start music:
```typescript
// Inside the slideshowActive useEffect, after setting up interval:
(async () => {
  try {
    const track = MUSIC_TRACKS.find(t => t.id === slideshowMusic);
    if (!track) return;
    const { sound } = await Audio.Sound.createAsync(
      { uri: track.url },
      { shouldPlay: true, isLooping: true, volume: 0.5 }
    );
    slideshowSoundRef.current = sound;
  } catch {}
})();
```

In `stopSlideshow`, also stop music:
```typescript
if (slideshowSoundRef.current) {
  slideshowSoundRef.current.unloadAsync();
  slideshowSoundRef.current = null;
}
```

**Step 2: Add SlideshowShareModal integration**

Import:
```typescript
import { SlideshowShareModal } from '../../components/photos/SlideshowShareModal';
```

Add state:
```typescript
const [showSlideshowShare, setShowSlideshowShare] = useState(false);
```

**Step 3: Change share button behavior based on slideshow state**

In the viewer top bar (around line 728), change the share button:

Replace:
```tsx
{selectedPhoto && (
  <TouchableOpacity style={styles.viewerBtn} onPress={() => handleSingleExport(selectedPhoto)}>
    <Icon name="share-outline" size={20} color="#FFFFFF" />
  </TouchableOpacity>
)}
```

With:
```tsx
{selectedPhoto && (
  <TouchableOpacity
    style={styles.viewerBtn}
    onPress={slideshowActive
      ? () => { stopSlideshow(); setShowSlideshowShare(true); }
      : () => handleSingleExport(selectedPhoto)
    }
  >
    <Icon name={slideshowActive ? 'link-outline' : 'share-outline'} size={20} color="#FFFFFF" />
  </TouchableOpacity>
)}
```

**Step 4: Add SlideshowShareModal to render**

Before the closing `</View>` of the screen, add:
```tsx
<SlideshowShareModal
  visible={showSlideshowShare}
  onClose={() => setShowSlideshowShare(false)}
  tripId={tripId}
  tripName={tripName}
  photoIds={flatPhotos.map(p => p.id)}
/>
```

**Step 5: Commit**

```bash
git add src/screens/trip/PhotosScreen.tsx
git commit -m "feat: integrate slideshow music + share modal in PhotosScreen"
```

---

### Task 9: Final integration + cleanup

**Step 1: Verify all navigation works**

- Test: `wayfable.ch/slideshow/:token` renders SlideshowViewScreen without auth
- Test: In-app slideshow plays music
- Test: Share button during slideshow opens SlideshowShareModal
- Test: Share button outside slideshow still exports single photo
- Test: Created link opens public slideshow with music

**Step 2: Deploy Edge Function**

```bash
npx supabase functions deploy get-slideshow --no-verify-jwt
```

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: Diashow-Sharing mit Musik — vollstaendige Integration"
```
