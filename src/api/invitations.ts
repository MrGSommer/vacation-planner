import { supabase } from './supabase';
import { TripInvitation, TripCollaborator, Profile } from '../types/database';
import { cachedQuery, invalidateCache } from '../utils/queryCache';

const BASE_URL = 'https://wayfable.ch';

export interface CollaboratorWithProfile extends TripCollaborator {
  profile: Pick<Profile, 'id' | 'email' | 'first_name' | 'last_name' | 'avatar_url'>;
}

export const getCollaboratorsForTrips = async (tripIds: string[]): Promise<Record<string, CollaboratorWithProfile[]>> => {
  if (tripIds.length === 0) return {};
  const { data, error } = await supabase
    .from('trip_collaborators')
    .select('*, profile:profiles!user_id(id, email, first_name, last_name, avatar_url)')
    .in('trip_id', tripIds);
  if (error) throw error;
  const result: Record<string, CollaboratorWithProfile[]> = {};
  for (const id of tripIds) result[id] = [];
  for (const row of (data || []) as unknown as CollaboratorWithProfile[]) {
    if (!result[row.trip_id]) result[row.trip_id] = [];
    result[row.trip_id].push(row);
  }
  return result;
};

export const getCollaborators = async (tripId: string): Promise<CollaboratorWithProfile[]> => {
  return cachedQuery(`collabs:${tripId}`, async () => {
    const { data, error } = await supabase
      .from('trip_collaborators')
      .select('*, profile:profiles!user_id(id, email, first_name, last_name, avatar_url)')
      .eq('trip_id', tripId);
    if (error) throw error;
    return (data || []) as unknown as CollaboratorWithProfile[];
  });
};

export const removeCollaborator = async (collaboratorId: string): Promise<void> => {
  const { error } = await supabase
    .from('trip_collaborators')
    .delete()
    .eq('id', collaboratorId);
  if (error) throw error;
  invalidateCache('collabs:');
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

// Internal: creates a new invitation row
const createInviteLinkInternal = async (
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
      is_active: true,
    })
    .select()
    .single();
  if (error) throw error;
  const prefix = type === 'info' ? 'share' : 'invite';
  return { token: data.token, url: `${BASE_URL}/${prefix}/${data.token}` };
};

// Get existing active link or create a new one
export const getOrCreateInviteLink = async (
  tripId: string,
  invitedBy: string,
  type: 'info' | 'collaborate',
  role: 'editor' | 'viewer' = 'viewer',
): Promise<{ token: string; url: string }> => {
  // Look for existing active link for this trip+type
  const { data: existing } = await supabase
    .from('trip_invitations')
    .select('token, type')
    .eq('trip_id', tripId)
    .eq('type', type)
    .eq('is_active', true)
    .single();

  if (existing) {
    const prefix = type === 'info' ? 'share' : 'invite';
    return { token: existing.token, url: `${BASE_URL}/${prefix}/${existing.token}` };
  }

  return createInviteLinkInternal(tripId, invitedBy, type, role);
};

// Reset an invite link: deactivate old, create new
export const resetInviteLink = async (
  tripId: string,
  invitedBy: string,
  type: 'info' | 'collaborate',
  role: 'editor' | 'viewer' = 'viewer',
): Promise<{ token: string; url: string }> => {
  // Deactivate all existing active links for this trip+type
  await supabase
    .from('trip_invitations')
    .update({ is_active: false })
    .eq('trip_id', tripId)
    .eq('type', type)
    .eq('is_active', true);

  return createInviteLinkInternal(tripId, invitedBy, type, role);
};

// Keep backward compatible export
export const createInviteLink = getOrCreateInviteLink;

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

// Leave a trip (non-owner: removes self; owner: returns requires_transfer/requires_delete)
export const leaveTrip = async (tripId: string): Promise<{
  success?: boolean;
  requires_transfer?: boolean;
  requires_delete_or_keep?: boolean;
  collaborator_count?: number;
  error?: string;
}> => {
  const { data, error } = await supabase.rpc('leave_trip', { p_trip_id: tripId });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  invalidateCache('collabs:');
  return data;
};

// Transfer ownership of a trip
export const transferOwnership = async (tripId: string, newOwnerId: string): Promise<void> => {
  const { data, error } = await supabase.rpc('transfer_ownership', {
    p_trip_id: tripId,
    p_new_owner_id: newOwnerId,
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  invalidateCache('collabs:');
  invalidateCache('trips:');
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
