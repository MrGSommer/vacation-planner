import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../api/supabase';
import { Profile } from '../types/database';
import { getProfile } from '../api/auth';
import { useToast } from './ToastContext';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  updateCreditsBalance: (newBalance: number) => void;
  pendingInviteToken: string | null;
  setPendingInviteToken: (token: string | null) => void;
  passwordRecovery: boolean;
  clearPasswordRecovery: () => void;
  pendingSetPassword: boolean;
  clearPendingSetPassword: () => void;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  updateCreditsBalance: () => {},
  pendingInviteToken: null,
  setPendingInviteToken: () => {},
  passwordRecovery: false,
  clearPasswordRecovery: () => {},
  pendingSetPassword: false,
  clearPendingSetPassword: () => {},
});

export const useAuthContext = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const { showToast } = useToast();
  const validatingRef = useRef(false);

  // Detect invite hash synchronously before Supabase clears it
  // Check both hash and full URL for type=invite (Supabase v2 uses fragments)
  const [pendingSetPassword, setPendingSetPassword] = useState(() => {
    if (Platform.OS === 'web') {
      try {
        const fullUrl = window.location.href;
        const hash = window.location.hash;
        return hash.includes('type=invite') || fullUrl.includes('type=invite');
      } catch { return false; }
    }
    return false;
  });

  const clearPendingSetPassword = useCallback(() => setPendingSetPassword(false), []);

  // Invite token: persist in sessionStorage (survives page reloads within same tab)
  const [pendingInviteToken, setPendingInviteTokenState] = useState<string | null>(() => {
    if (Platform.OS === 'web') {
      try { return sessionStorage.getItem('pendingInviteToken'); } catch { return null; }
    }
    return null;
  });

  const setPendingInviteToken = useCallback((token: string | null) => {
    setPendingInviteTokenState(token);
    if (Platform.OS === 'web') {
      try {
        if (token) sessionStorage.setItem('pendingInviteToken', token);
        else sessionStorage.removeItem('pendingInviteToken');
      } catch {}
    }
  }, []);

  const clearPasswordRecovery = useCallback(() => setPasswordRecovery(false), []);

  // Force sign-out for deleted/invalid users
  const forceSignOut = useCallback(async (message: string) => {
    if (validatingRef.current) return; // prevent double sign-out
    validatingRef.current = true;
    try {
      setSession(null);
      setUser(null);
      setProfile(null);
      await supabase.auth.signOut();
      const { clearCache } = await import('../utils/queryCache');
      clearCache();
      showToast(message, 'error', 5000);
    } finally {
      validatingRef.current = false;
    }
  }, [showToast]);

  // Validate session server-side (getUser hits the API, unlike getSession which is local)
  const validateSession = useCallback(async () => {
    if (validatingRef.current) return;
    const { data: { user: serverUser }, error } = await supabase.auth.getUser();
    if (error || !serverUser) {
      await forceSignOut('Dein Konto ist nicht mehr verfügbar. Du wurdest abgemeldet.');
    }
  }, [forceSignOut]);

  const refreshProfile = async () => {
    if (user) {
      try {
        const p = await getProfile(user.id);
        setProfile(p);
      } catch {
        // Profile fetch failed — check if user still exists server-side
        await validateSession();
      }
    }
  };

  const updateCreditsBalance = (newBalance: number) => {
    setProfile(prev => prev ? { ...prev, ai_credits_balance: newBalance } : prev);
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (s) {
        // Validate server-side that user still exists
        const { data: { user: serverUser }, error } = await supabase.auth.getUser();
        if (error || !serverUser) {
          await supabase.auth.signOut();
          setSession(null);
          setUser(null);
          setLoading(false);
          showToast('Dein Konto ist nicht mehr verfügbar. Du wurdest abgemeldet.', 'error', 5000);
          return;
        }
      }
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Re-validate on window focus (web) — catches deletions while tab was in background
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onFocus = () => {
      if (session) validateSession();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [session, validateSession]);

  useEffect(() => {
    if (user) {
      refreshProfile();
    } else {
      setProfile(null);
    }
  }, [user]);

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, refreshProfile, updateCreditsBalance, pendingInviteToken, setPendingInviteToken, passwordRecovery, clearPasswordRecovery, pendingSetPassword, clearPendingSetPassword }}>
      {children}
    </AuthContext.Provider>
  );
};
