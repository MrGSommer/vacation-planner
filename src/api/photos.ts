import { Platform } from 'react-native';
import { supabase } from './supabase';
import { Photo, ItineraryDay } from '../types/database';
import { cachedQuery, invalidateCache } from '../utils/queryCache';
import { searchPhotos, triggerDownload } from './unsplash';
import { createDay } from './itineraries';

/** A place to fetch inspiration photos for (from stops or hotel activities) */
export interface InspirationLocation {
  name: string;
  date: string; // YYYY-MM-DD
}

export const getPhotos = async (tripId: string): Promise<Photo[]> => {
  return cachedQuery(`photos:${tripId}`, async () => {
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .eq('trip_id', tripId)
      .order('taken_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    return data || [];
  });
};

/** Parse EXIF date string (YYYY:MM:DD HH:MM:SS) to ISO string */
export const parseExifDate = (exifDate: string | undefined | null): string | null => {
  if (!exifDate) return null;
  // EXIF format: "2024:03:15 14:30:00" or "2024:03:15"
  const cleaned = exifDate.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
  const date = new Date(cleaned);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
};

/** Auto-assign a photo to the correct itinerary day based on taken_at date */
export const autoAssignDayId = async (
  tripId: string,
  takenAtISO: string,
): Promise<string | null> => {
  const dateStr = takenAtISO.slice(0, 10); // YYYY-MM-DD
  const { data } = await supabase
    .from('itinerary_days')
    .select('id, date')
    .eq('trip_id', tripId)
    .eq('date', dateStr)
    .limit(1);
  return data && data.length > 0 ? data[0].id : null;
};

/** Batch auto-assign day_id for photos that don't have one */
export const autoTagPhotos = async (tripId: string): Promise<number> => {
  // Get all photos without day_id that have a taken_at
  const { data: photos } = await supabase
    .from('photos')
    .select('id, taken_at')
    .eq('trip_id', tripId)
    .is('day_id', null)
    .not('taken_at', 'is', null);

  if (!photos || photos.length === 0) return 0;

  // Get all itinerary days for trip
  const { data: days } = await supabase
    .from('itinerary_days')
    .select('id, date')
    .eq('trip_id', tripId);

  if (!days || days.length === 0) return 0;

  const dayMap = new Map(days.map(d => [d.date, d.id]));
  let tagged = 0;

  for (const photo of photos) {
    if (!photo.taken_at) continue;
    const dateStr = photo.taken_at.slice(0, 10);
    const dayId = dayMap.get(dateStr);
    if (dayId) {
      await supabase.from('photos').update({ day_id: dayId }).eq('id', photo.id);
      tagged++;
    }
  }

  return tagged;
};

/**
 * Compress an image on web using Canvas.
 * Resizes to max dimension on longest side with given JPEG quality.
 * Handles JPEG, PNG, WebP, HEIC (Safari/iOS), AVIF, and TIFF.
 * Canvas.toBlob always outputs JPEG — automatic format conversion.
 */
const compressImageWeb = (uri: string, maxSize = 1600, quality = 0.75): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let { width, height } = img;

      // Only downscale, never upscale
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Compression failed')),
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = uri;
  });
};

/** Generate a small thumbnail (300px, quality 0.5) for fast grid loading */
const generateThumbnailWeb = (uri: string): Promise<Blob> =>
  compressImageWeb(uri, 200, 0.4);

/** Sanitize a string for use in filenames (remove special chars, spaces → underscores) */
const sanitizeForFilename = (s: string): string =>
  s.replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue')
    .replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase();

/** Build a standardized photo filename: wayfable_{trip}_{datum}.jpg */
const buildPhotoName = (tripName: string | undefined, exifDate: string | null | undefined, index?: number): string => {
  const trip = tripName ? sanitizeForFilename(tripName) : 'trip';
  const dateStr = exifDate
    ? exifDate.slice(0, 10).replace(/-/g, '') // "20260315"
    : new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = index !== undefined ? `_${index}` : '';
  return `wayfable_${trip}_${dateStr}${suffix}.jpg`;
};

export const uploadPhoto = async (
  tripId: string,
  userId: string,
  uri: string,
  fileName: string,
  dayId?: string,
  exifDate?: string | null,
  tripName?: string,
  creatorName?: string,
  exifLat?: number | null,
  exifLng?: number | null,
): Promise<Photo> => {
  const cleanName = buildPhotoName(tripName, exifDate);
  const ts = Date.now();
  const path = `${tripId}/${ts}_${cleanName}`;
  const thumbPath = `${tripId}/thumb_${ts}_${cleanName}`;

  let blob: Blob;
  let thumbBlob: Blob | null = null;
  if (Platform.OS === 'web') {
    // Web: compress via Canvas (resize + JPEG re-encode)
    try {
      blob = await compressImageWeb(uri);
    } catch {
      const response = await fetch(uri);
      blob = await response.blob();
    }
    // Generate thumbnail for fast grid loading (300px, quality 0.5)
    try {
      thumbBlob = await generateThumbnailWeb(uri);
    } catch { /* grid will fall back to full image */ }
  } else {
    // Native: expo-image-picker already applies quality: 0.7
    const response = await fetch(uri);
    blob = await response.blob();
  }

  const { error: uploadError } = await supabase.storage
    .from('trip-photos')
    .upload(path, blob, { contentType: 'image/jpeg' });
  if (uploadError) throw uploadError;

  // Upload thumbnail (non-blocking — if it fails, grid uses full image)
  let thumbnailUrl: string | null = null;
  if (thumbBlob) {
    const { error: thumbError } = await supabase.storage
      .from('trip-photos')
      .upload(thumbPath, thumbBlob, { contentType: 'image/jpeg' });
    if (!thumbError) {
      thumbnailUrl = supabase.storage.from('trip-photos').getPublicUrl(thumbPath).data.publicUrl;
    }
  }

  const { data: { publicUrl } } = supabase.storage
    .from('trip-photos')
    .getPublicUrl(path);

  const takenAt = exifDate || new Date().toISOString();

  // Auto-assign day_id if not provided
  let resolvedDayId = dayId || null;
  if (!resolvedDayId && takenAt) {
    resolvedDayId = await autoAssignDayId(tripId, takenAt);
  }

  const { data, error } = await supabase
    .from('photos')
    .insert({
      trip_id: tripId,
      user_id: userId,
      storage_path: path,
      url: publicUrl,
      thumbnail_url: thumbnailUrl,
      day_id: resolvedDayId,
      taken_at: takenAt,
      creator_name: creatorName || null,
      lat: exifLat || null,
      lng: exifLng || null,
    })
    .select()
    .single();
  if (error) {
    // Trigger blocked insert (Free tier limit or similar) — clean up orphaned storage files
    try {
      const pathsToRemove = [path];
      if (thumbnailUrl) pathsToRemove.push(thumbPath);
      await supabase.storage.from('trip-photos').remove(pathsToRemove);
    } catch { /* ignore cleanup failures */ }
    if (error.message?.includes('photo_limit_reached')) {
      const e = new Error('photo_limit_reached');
      (e as any).code = 'photo_limit_reached';
      throw e;
    }
    throw error;
  }
  invalidateCache(`photos:${tripId}`);
  return data;
};

export const updatePhotoCaption = async (photoId: string, caption: string | null): Promise<void> => {
  const { error } = await supabase.from('photos').update({ caption }).eq('id', photoId);
  if (error) throw error;
};

/** Derive thumbnail storage path from the full-size path */
const thumbPathFromFull = (storagePath: string): string => {
  const parts = storagePath.split('/');
  const file = parts.pop() || '';
  return [...parts, `thumb_${file}`].join('/');
};

export const deletePhoto = async (photo: Photo): Promise<void> => {
  // Clean up storage files (non-blocking — skip for Unsplash photos which have no storage)
  if (!photo.storage_path.startsWith('unsplash:')) {
    const paths = [photo.storage_path, thumbPathFromFull(photo.storage_path)];
    try { await supabase.storage.from('trip-photos').remove(paths); } catch { /* ignore */ }
  }
  const { error } = await supabase.from('photos').delete().eq('id', photo.id);
  if (error) throw error;
  invalidateCache(`photos:${photo.trip_id}`);
};

export const deletePhotos = async (photos: Photo[]): Promise<void> => {
  if (photos.length === 0) return;
  const uploadPhotos = photos.filter(p => !p.storage_path.startsWith('unsplash:'));
  if (uploadPhotos.length > 0) {
    const paths = uploadPhotos.flatMap(p => [p.storage_path, thumbPathFromFull(p.storage_path)]);
    try { await supabase.storage.from('trip-photos').remove(paths); } catch { /* ignore */ }
  }
  const ids = photos.map(p => p.id);
  const { error } = await supabase.from('photos').delete().in('id', ids);
  if (error) throw error;
  if (photos[0]) invalidateCache(`photos:${photos[0].trip_id}`);
};

/** Insert 2 Unsplash inspiration photos per location */
export const insertInspirationPhotos = async (
  tripId: string, userId: string, locations: InspirationLocation[],
): Promise<Photo[]> => {
  const inserted: Photo[] = [];

  for (const loc of locations) {
    await createDay(tripId, loc.date);

    const results = await searchPhotos(loc.name, 4);
    const picked = results.slice(0, 2);

    for (const photo of picked) {
      await triggerDownload(photo);
      const takenAt = `${loc.date}T12:00:00Z`;
      const dayId = await autoAssignDayId(tripId, takenAt);
      const attribution = `${photo.user.name}|${photo.user.links.html}|${photo.links.html}`;

      const { data, error } = await supabase.from('photos').insert({
        trip_id: tripId, user_id: userId,
        storage_path: `unsplash:${photo.id}`,
        url: photo.urls.regular,
        thumbnail_url: photo.urls.small,
        taken_at: takenAt, day_id: dayId,
        source: 'unsplash',
        unsplash_attribution: attribution,
        caption: `📍 ${loc.name}`,
      }).select().single();

      if (!error && data) inserted.push(data);
    }
  }

  invalidateCache(`photos:${tripId}`);
  return inserted;
};

/** Remove all Unsplash inspiration photos for a trip */
export const removeInspirationPhotos = async (tripId: string): Promise<void> => {
  await supabase.from('photos').delete().eq('trip_id', tripId).eq('source', 'unsplash');
  invalidateCache(`photos:${tripId}`);
};

