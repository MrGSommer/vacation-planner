import React, { createContext, useContext, useState, useCallback } from 'react';
import { Trip } from '../types/database';
import { getTrips, getTrip, updateTrip } from '../api/trips';
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

      // Auto-update trip statuses based on dates
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const updates: Promise<any>[] = [];

      for (const trip of data) {
        const start = new Date(trip.start_date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(trip.end_date);
        end.setHours(23, 59, 59, 999);

        let expectedStatus: string | null = null;
        if (today > end && trip.status !== 'completed') {
          expectedStatus = 'completed';
        } else if (today >= start && today <= end && trip.status !== 'active') {
          expectedStatus = 'active';
        } else if (today < start && trip.status !== 'upcoming' && trip.status !== 'planning') {
          expectedStatus = 'upcoming';
        }

        if (expectedStatus) {
          trip.status = expectedStatus;
          updates.push(updateTrip(trip.id, { status: expectedStatus }).catch(e => {
            console.error(`Auto-status update failed for trip ${trip.id}:`, e);
          }));
        }
      }

      if (updates.length > 0) {
        Promise.all(updates).catch(() => {});
      }

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
