import React, { useEffect } from 'react';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { useAdmin } from '../../hooks/useAdmin';

interface AdminGuardProps {
  children: React.ReactNode;
}

export const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
  const { isAdmin } = useAdmin();
  const navigation = useNavigation();

  useEffect(() => {
    if (!isAdmin) {
      navigation.dispatch(
        CommonActions.reset({ index: 0, routes: [{ name: 'Main' }] })
      );
    }
  }, [isAdmin, navigation]);

  if (!isAdmin) return null;

  return <>{children}</>;
};
