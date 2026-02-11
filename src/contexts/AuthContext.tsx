import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../api/supabase';
import { Profile } from '../types/database';
import { getProfile } from '../api/auth';

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
});

export const useAuthContext = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

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

  const refreshProfile = async () => {
    if (user) {
      try {
        const p = await getProfile(user.id);
        setProfile(p);
      } catch {}
    }
  };

  const updateCreditsBalance = (newBalance: number) => {
    setProfile(prev => prev ? { ...prev, ai_credits_balance: newBalance } : prev);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
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

  useEffect(() => {
    if (user) {
      refreshProfile();
    } else {
      setProfile(null);
    }
  }, [user]);

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, refreshProfile, updateCreditsBalance, pendingInviteToken, setPendingInviteToken, passwordRecovery, clearPasswordRecovery }}>
      {children}
    </AuthContext.Provider>
  );
};
