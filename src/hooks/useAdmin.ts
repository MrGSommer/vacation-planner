import { useMemo } from 'react';
import { jwtDecode } from 'jwt-decode';
import { useAuthContext } from '../contexts/AuthContext';

interface JwtPayload {
  app_metadata?: { admin?: boolean };
}

export const useAdmin = (): { isAdmin: boolean } => {
  const { session } = useAuthContext();

  const isAdmin = useMemo(() => {
    if (!session?.access_token) return false;
    try {
      const decoded = jwtDecode<JwtPayload>(session.access_token);
      return decoded.app_metadata?.admin === true;
    } catch {
      return false;
    }
  }, [session?.access_token]);

  return { isAdmin };
};
