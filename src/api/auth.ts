import { supabase } from './supabase';

export const signUpWithEmail = async (email: string, password: string, firstName: string, lastName: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { first_name: firstName || null, last_name: lastName || null } },
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

export const signInWithGoogle = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'https://wayfable.ch',
    },
  });
  if (error) throw error;
};

export const signOut = async () => {
  const { clearCache } = await import('../utils/queryCache');
  clearCache();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const resetPassword = async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://wayfable.ch',
  });
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

export const deleteAccount = async (password?: string, confirmText?: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Nicht angemeldet');

  const res = await supabase.functions.invoke('delete-account', {
    body: { password, confirm_text: confirmText },
  });
  if (res.error) throw new Error(res.error.message || 'Kontolöschung fehlgeschlagen');
  if (res.data?.error) throw new Error(res.data.error);

  const { clearCache } = await import('../utils/queryCache');
  clearCache();
  await supabase.auth.signOut();
};

export const updateProfile = async (userId: string, updates: {
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  preferred_language?: string;
  preferred_currency?: string;
  notifications_enabled?: boolean;
  ai_trip_context_enabled?: boolean;
  ai_custom_instruction?: string | null;
}) => {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
};
