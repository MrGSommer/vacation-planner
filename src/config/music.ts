const STORAGE_BASE = 'https://ogwccvzyhljxwtcbjbsd.supabase.co/storage/v1/object/public/music';

export type MusicTrack = 'relaxed' | 'adventure' | 'romantic' | 'festive';

export interface MusicTrackInfo {
  id: MusicTrack;
  label: string;
  description: string;
  url: string;
  icon: string;
}

export const MUSIC_TRACKS: MusicTrackInfo[] = [
  { id: 'relaxed', label: 'Entspannt', description: 'Ruhig & akustisch', url: `${STORAGE_BASE}/relaxed.mp3`, icon: 'leaf-outline' },
  { id: 'adventure', label: 'Abenteuer', description: 'Energisch & upbeat', url: `${STORAGE_BASE}/adventure.mp3`, icon: 'compass-outline' },
  { id: 'romantic', label: 'Romantisch', description: 'Sanft & Piano', url: `${STORAGE_BASE}/romantic.mp3`, icon: 'heart-outline' },
  { id: 'festive', label: 'Festlich', description: 'Fröhlich & lebhaft', url: `${STORAGE_BASE}/festive.mp3`, icon: 'musical-notes-outline' },
];

export const getMusicUrl = (track: MusicTrack): string =>
  MUSIC_TRACKS.find(t => t.id === track)?.url || MUSIC_TRACKS[0].url;
