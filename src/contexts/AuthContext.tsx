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
  pendingRedirectPath: string | null;
  setPendingRedirectPath: (path: string | null) => void;
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
  pendingRedirectPath: null,
  setPendingRedirectPath: () => {},
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
      try {
        const token = sessionStorage.getItem('pendingInviteToken');
        const ts = sessionStorage.getItem('pendingInviteToken_ts');
        if (token && ts && Date.now() - parseInt(ts, 10) < 30 * 60 * 1000) return token;
        // Expired or missing — clean up
        sessionStorage.removeItem('pendingInviteToken');
        sessionStorage.removeItem('pendingInviteToken_ts');
        return null;
      } catch { return null; }
    }
    return null;
  });

  const setPendingInviteToken = useCallback((token: string | null) => {
    setPendingInviteTokenState(token);
    if (Platform.OS === 'web') {
      try {
        if (token) {
          sessionStorage.setItem('pendingInviteToken', token);
          sessionStorage.setItem('pendingInviteToken_ts', String(Date.now()));
        } else {
          sessionStorage.removeItem('pendingInviteToken');
          sessionStorage.removeItem('pendingInviteToken_ts');
        }
      } catch {}
    }
  }, []);

  // Pending redirect path: preserve deep link destination through login
  const [pendingRedirectPath, setPendingRedirectPathState] = useState<string | null>(() => {
    if (Platform.OS === 'web') {
      try {
        const path = sessionStorage.getItem('pendingRedirectPath');
        const ts = sessionStorage.getItem('pendingRedirectPath_ts');
        if (path && ts && Date.now() - parseInt(ts, 10) < 30 * 60 * 1000) return path;
        sessionStorage.removeItem('pendingRedirectPath');
        sessionStorage.removeItem('pendingRedirectPath_ts');
        return null;
      } catch { return null; }
    }
    return null;
  });

  const setPendingRedirectPath = useCallback((path: string | null) => {
    setPendingRedirectPathState(path);
    if (Platform.OS === 'web') {
      try {
        if (path) {
          sessionStorage.setItem('pendingRedirectPath', path);
          sessionStorage.setItem('pendingRedirectPath_ts', String(Date.now()));
        } else {
          sessionStorage.removeItem('pendingRedirectPath');
          sessionStorage.removeItem('pendingRedirectPath_ts');
        }
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
      if (Platform.OS === 'web') {
        try { localStorage.removeItem('wayfable_profile'); } catch {}
      }
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
    // Skip validation when offline — can't reach server anyway
    if (Platform.OS === 'web' && !navigator.onLine) return;
    const { data: { user: serverUser }, error } = await supabase.auth.getUser();
    if (error || !serverUser) {
      await forceSignOut('Dein Konto ist nicht mehr verfügbar. Du wurdest abgemeldet.');
    }
  }, [forceSignOut]);

  const refreshProfile = async () => {
    if (user) {
      // Skip fetch if session was already cleared (sign-out in progress)
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s) return;
      try {
        const p = await getProfile(user.id);
        setProfile(p);
        // Cache profile for offline use
        if (Platform.OS === 'web') {
          try { localStorage.setItem('wayfable_profile', JSON.stringify(p)); } catch {}
        }
      } catch {
        // Offline: load cached profile if user ID matches
        if (Platform.OS === 'web' && !navigator.onLine) {
          try {
            const cached = localStorage.getItem('wayfable_profile');
            if (cached) {
              const parsed = JSON.parse(cached);
              if (parsed.id === user.id) {
                setProfile(parsed);
                return;
              }
            }
          } catch {}
        }
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
      // Offline fallback: if session is null and we're offline,
      // try reading raw session from localStorage
      if (!s && Platform.OS === 'web' && !navigator.onLine) {
        try {
          const stored = localStorage.getItem(
            'sb-ogwccvzyhljxwtcbjbsd-auth-token'
          );
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed?.access_token && parsed?.user) {
              s = parsed as Session;
            }
          }
        } catch {}
      }

      if (s) {
        // Validate server-side that user still exists (skip when offline)
        if (Platform.OS !== 'web' || navigator.onLine) {
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
      if (event === 'SIGNED_OUT') {
        // Prevent forceSignOut from showing "Konto nicht verfügbar" on normal logout
        validatingRef.current = true;
        setProfile(null);
        setTimeout(() => { validatingRef.current = false; }, 1000);
      }
    });

    // Refresh tokens when connectivity returns
    const onOnline = () => {
      supabase.auth.getSession().then(({ data: { session: freshSession } }) => {
        if (freshSession) {
          setSession(freshSession);
          setUser(freshSession.user);
        }
      });
    };
    if (Platform.OS === 'web') {
      window.addEventListener('online', onOnline);
    }

    return () => {
      subscription.unsubscribe();
      if (Platform.OS === 'web') {
        window.removeEventListener('online', onOnline);
      }
    };
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
    <AuthContext.Provider value={{ session, user, profile, loading, refreshProfile, updateCreditsBalance, pendingInviteToken, setPendingInviteToken, pendingRedirectPath, setPendingRedirectPath, passwordRecovery, clearPasswordRecovery, pendingSetPassword, clearPendingSetPassword }}>
      {children}
    </AuthContext.Provider>
  );
};
