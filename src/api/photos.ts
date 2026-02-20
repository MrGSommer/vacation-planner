import { supabase } from './supabase';
import { Photo } from '../types/database';

export const getPhotos = async (tripId: string): Promise<Photo[]> => {
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .eq('trip_id', tripId)
    .order('taken_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const uploadPhoto = async (
  tripId: string,
  userId: string,
  uri: string,
  fileName: string,
  dayId?: string
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

  const { data, error } = await supabase
    .from('photos')
    .insert({
      trip_id: tripId,
      user_id: userId,
      storage_path: path,
      url: publicUrl,
      day_id: dayId || null,
      taken_at: new Date().toISOString(),
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
