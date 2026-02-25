import { supabase } from './supabase';
import { Photo, ItineraryDay } from '../types/database';

export const getPhotos = async (tripId: string): Promise<Photo[]> => {
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .eq('trip_id', tripId)
    .order('taken_at', { ascending: false });
  if (error) throw error;
  return data || [];
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

export const uploadPhoto = async (
  tripId: string,
  userId: string,
  uri: string,
  fileName: string,
  dayId?: string,
  exifDate?: string | null,
): Promise<Photo> => {
  const path = `${tripId}/${Date.now()}_${fileName}`;

  const response = await fetch(uri);
  const blob = await response.blob();

  const { error: uploadError } = await supabase.storage
    .from('trip-photos')
    .upload(path, blob, { contentType: 'image/jpeg' });
  if (uploadError) throw uploadError;

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
      day_id: resolvedDayId,
      taken_at: takenAt,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updatePhotoCaption = async (photoId: string, caption: string | null): Promise<void> => {
  const { error } = await supabase.from('photos').update({ caption }).eq('id', photoId);
  if (error) throw error;
};

export const deletePhoto = async (photo: Photo): Promise<void> => {
  await supabase.storage.from('trip-photos').remove([photo.storage_path]);
  const { error } = await supabase.from('photos').delete().eq('id', photo.id);
  if (error) throw error;
};

export const deletePhotos = async (photos: Photo[]): Promise<void> => {
  if (photos.length === 0) return;
  const paths = photos.map(p => p.storage_path);
  const ids = photos.map(p => p.id);
  await supabase.storage.from('trip-photos').remove(paths);
  const { error } = await supabase.from('photos').delete().in('id', ids);
  if (error) throw error;
};
