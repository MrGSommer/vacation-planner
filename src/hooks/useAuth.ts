import { useState } from 'react';
import { signUpWithEmail, signInWithEmail, signInWithGoogle, signOut } from '../api/auth';
import { useAuthContext } from '../contexts/AuthContext';

export const useAuth = () => {
  const context = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async (email: string, password: string, firstName: string, lastName: string) => {
    setLoading(true);
    setError(null);
    try {
      await signUpWithEmail(email, password, firstName, lastName);
    } catch (e: any) {
      setError(e.message || 'Registrierung fehlgeschlagen');
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
    } catch (e: any) {
      setError(e.message || 'Anmeldung fehlgeschlagen');
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const handleSignInWithGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      setError(e.message || 'Google-Anmeldung fehlgeschlagen');
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut();
    } catch (e: any) {
      setError(e.message || 'Abmeldung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return {
    ...context,
    loading: context.loading || loading,
    error,
    signUp: handleSignUp,
    signIn: handleSignIn,
    signInWithGoogle: handleSignInWithGoogle,
    signOut: handleSignOut,
    clearError: () => setError(null),
  };
};
