import { supabase } from './supabase';
import { TripInvitation, TripCollaborator, Profile } from '../types/database';

const BASE_URL = 'https://vacation-planner-gs.netlify.app';

export interface CollaboratorWithProfile extends TripCollaborator {
  profile: Pick<Profile, 'id' | 'email' | 'full_name' | 'avatar_url'>;
}

export const getCollaborators = async (tripId: string): Promise<CollaboratorWithProfile[]> => {
  const { data, error } = await supabase
    .from('trip_collaborators')
    .select('*, profile:profiles!user_id(id, email, full_name, avatar_url)')
    .eq('trip_id', tripId);
  if (error) throw error;
  return (data || []) as unknown as CollaboratorWithProfile[];
};

export const removeCollaborator = async (collaboratorId: string): Promise<void> => {
  const { error } = await supabase
    .from('trip_collaborators')
    .delete()
    .eq('id', collaboratorId);
  if (error) throw error;
};

export const updateCollaboratorRole = async (
  collaboratorId: string,
  role: 'editor' | 'viewer',
): Promise<void> => {
  const { error } = await supabase
    .from('trip_collaborators')
    .update({ role })
    .eq('id', collaboratorId);
  if (error) throw error;
};

export const createInviteLink = async (
  tripId: string,
  invitedBy: string,
  type: 'info' | 'collaborate',
  role: 'editor' | 'viewer' = 'viewer',
): Promise<{ token: string; url: string }> => {
  const { data, error } = await supabase
    .from('trip_invitations')
    .insert({
      trip_id: tripId,
      invited_by: invitedBy,
      type,
      role,
      status: 'pending',
    })
    .select()
    .single();
  if (error) throw error;
  const prefix = type === 'info' ? 'share' : 'invite';
  return { token: data.token, url: `${BASE_URL}/${prefix}/${data.token}` };
};

export interface InviteResponse {
  invitation: TripInvitation;
  trip: { id: string; name: string; destination: string; start_date: string; end_date: string } | null;
}

export const getInviteByToken = async (token: string): Promise<InviteResponse> => {
  const { data, error } = await supabase.rpc('lookup_invite', { invite_token: token });
  if (error || !data) throw new Error('Einladung nicht gefunden');
  if (data.error) throw new Error(data.error);
  return data;
};

export const acceptInvite = async (token: string): Promise<{ success: boolean; trip_id: string }> => {
  const { data, error } = await supabase.rpc('accept_invite', { invite_token: token });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
};

export interface ShareTripData {
  trip: { id: string; name: string; destination: string; start_date: string; end_date: string; cover_image_url: string | null };
  stops: Array<{ id: string; name: string; latitude: number; longitude: number; order_index: number; arrival_date: string | null; departure_date: string | null }>;
  activities: Array<{ id: string; title: string; description: string | null; category: string; date: string; start_time: string | null; end_time: string | null; location_name: string | null; latitude: number | null; longitude: number | null; stop_id: string | null; is_checked_in: boolean }>;
}

export const getSharedTrip = async (token: string): Promise<ShareTripData> => {
  const { data, error } = await supabase.functions.invoke('share-trip', {
    body: { token },
  });
  if (error) throw new Error(error.message || 'Share-Link nicht gefunden');
  if (data?.error) throw new Error(data.error);
  return data;
};
