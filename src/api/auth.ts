import { supabase } from './supabase';

export const signUpWithEmail = async (email: string, password: string, firstName: string, lastName: string) => {
  const fullName = `${firstName} ${lastName}`.trim();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName || null, first_name: firstName || null, last_name: lastName || null } },
  });
  if (error) throw error;
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    throw new Error('Diese E-Mail-Adresse ist bereits registriert. Bitte melde dich stattdessen an.');
  }
  return data;
};

export const signInWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  const { clearCache } = await import('../utils/queryCache');
  clearCache();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const resetPassword = async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
};

export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
};

export const getProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
};

export const updateProfile = async (userId: string, updates: {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  preferred_language?: string;
  preferred_currency?: string;
  notifications_enabled?: boolean;
  ai_trip_context_enabled?: boolean;
}) => {
  if (updates.first_name !== undefined || updates.last_name !== undefined) {
    updates.full_name = `${updates.first_name ?? ''} ${updates.last_name ?? ''}`.trim() || null as any;
  }
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
};
