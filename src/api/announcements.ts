import { supabase } from './supabase';
import { Announcement } from '../types/database';

// --- User functions ---

export const getActiveAnnouncements = async (): Promise<Announcement[]> => {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('active', true)
    .order('priority', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const getDismissedAnnouncementIds = async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from('announcement_dismissals')
    .select('announcement_id');

  if (error) throw error;
  return (data || []).map((d) => d.announcement_id);
};

export const dismissAnnouncement = async (announcementId: string): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht authentifiziert');

  const { error } = await supabase
    .from('announcement_dismissals')
    .insert({ user_id: user.id, announcement_id: announcementId });

  if (error) throw error;
};

// --- Admin functions ---

export const adminGetAllAnnouncements = async (): Promise<Announcement[]> => {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const adminCreateAnnouncement = async (
  announcement: Pick<Announcement, 'title' | 'body'> & Partial<Pick<Announcement, 'image_url' | 'cta_text' | 'cta_url' | 'target_audience' | 'priority' | 'active'>>
): Promise<Announcement> => {
  const { data, error } = await supabase
    .from('announcements')
    .insert(announcement)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const adminUpdateAnnouncement = async (
  id: string,
  updates: Partial<Omit<Announcement, 'id' | 'created_at' | 'updated_at'>>
): Promise<Announcement> => {
  const { data, error } = await supabase
    .from('announcements')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const adminDeleteAnnouncement = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

export const adminGetDismissalCount = async (announcementId: string): Promise<number> => {
  const { count, error } = await supabase
    .from('announcement_dismissals')
    .select('*', { count: 'exact', head: true })
    .eq('announcement_id', announcementId);

  if (error) throw error;
  return count || 0;
};
