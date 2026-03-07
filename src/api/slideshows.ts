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
