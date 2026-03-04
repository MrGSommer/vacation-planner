import { supabase } from './supabase';

export interface Poll {
  id: string;
  trip_id: string;
  created_by: string;
  question: string;
  options: string[];
  is_closed: boolean;
  created_at: string;
}

export interface PollVote {
  id: string;
  poll_id: string;
  user_id: string;
  option_index: number;
  created_at: string;
}

export interface PollWithVotes extends Poll {
  votes: PollVote[];
}

export const getPolls = async (tripId: string): Promise<PollWithVotes[]> => {
  const { data: polls, error } = await supabase
    .from('activity_polls')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!polls || polls.length === 0) return [];

  const pollIds = polls.map(p => p.id);
  const { data: votes } = await supabase
    .from('poll_votes')
    .select('*')
    .in('poll_id', pollIds);

  return polls.map(p => ({
    ...p,
    options: p.options as string[],
    votes: (votes || []).filter(v => v.poll_id === p.id),
  }));
};

export const createPoll = async (tripId: string, userId: string, question: string, options: string[]): Promise<Poll> => {
  const { data, error } = await supabase
    .from('activity_polls')
    .insert({ trip_id: tripId, created_by: userId, question, options })
    .select()
    .single();
  if (error) throw error;
  return { ...data, options: data.options as string[] };
};

export const vote = async (pollId: string, userId: string, optionIndex: number): Promise<void> => {
  // Remove existing vote first
  await supabase.from('poll_votes').delete().eq('poll_id', pollId).eq('user_id', userId);
  // Insert new vote
  const { error } = await supabase
    .from('poll_votes')
    .insert({ poll_id: pollId, user_id: userId, option_index: optionIndex });
  if (error) throw error;
};

export const closePoll = async (pollId: string): Promise<void> => {
  const { error } = await supabase
    .from('activity_polls')
    .update({ is_closed: true })
    .eq('id', pollId);
  if (error) throw error;
};
