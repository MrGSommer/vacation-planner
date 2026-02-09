import React, { createContext, useContext, useState, useCallback } from 'react';
import { Trip } from '../types/database';
import { getTrips, getTrip } from '../api/trips';
import { useAuthContext } from './AuthContext';
import { logError } from '../services/errorLogger';

interface TripContextType {
  trips: Trip[];
  currentTrip: Trip | null;
  loading: boolean;
  fetchTrips: () => Promise<void>;
  setCurrentTrip: (trip: Trip | null) => void;
  refreshCurrentTrip: () => Promise<void>;
}

const TripContext = createContext<TripContextType>({
  trips: [],
  currentTrip: null,
  loading: false,
  fetchTrips: async () => {},
  setCurrentTrip: () => {},
  refreshCurrentTrip: async () => {},
});

export const useTripContext = () => useContext(TripContext);

export const TripProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthContext();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchTrips = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getTrips(user.id);
      setTrips(data);
    } catch (e) {
      console.error('Fehler beim Laden der Trips:', e);
      logError(e, { component: 'TripContext', context: { action: 'fetchTrips' } });
    } finally {
      setLoading(false);
    }
  }, [user]);

  const refreshCurrentTrip = useCallback(async () => {
    if (!currentTrip) return;
    try {
      const data = await getTrip(currentTrip.id);
      setCurrentTrip(data);
    } catch (e) {
      console.error('Fehler beim Aktualisieren des Trips:', e);
      logError(e, { component: 'TripContext', context: { action: 'refreshTrip' } });
    }
  }, [currentTrip]);

  return (
    <TripContext.Provider value={{ trips, currentTrip, loading, fetchTrips, setCurrentTrip, refreshCurrentTrip }}>
      {children}
    </TripContext.Provider>
  );
};
