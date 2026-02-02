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
  return { token: data.token, url: `${BASE_URL}/invite/${data.token}` };
};

export const getInviteByToken = async (token: string): Promise<TripInvitation> => {
  const { data, error } = await supabase
    .from('trip_invitations')
    .select('*')
    .eq('token', token)
    .single();
  if (error) throw error;
  return data;
};

export const acceptInvite = async (token: string, userId: string): Promise<void> => {
  const invitation = await getInviteByToken(token);

  if (invitation.status !== 'pending') {
    throw new Error('Einladung wurde bereits verwendet');
  }

  // Add user as collaborator
  const { error: collabError } = await supabase
    .from('trip_collaborators')
    .insert({
      trip_id: invitation.trip_id,
      user_id: userId,
      role: invitation.role,
    });
  if (collabError) throw collabError;

  // Mark invitation as accepted
  const { error: updateError } = await supabase
    .from('trip_invitations')
    .update({ status: 'accepted', invited_email: null })
    .eq('token', token);
  if (updateError) throw updateError;
};
