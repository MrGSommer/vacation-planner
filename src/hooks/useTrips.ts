import { useState, useCallback } from 'react';
import { Trip } from '../types/database';
import * as tripsApi from '../api/trips';
import { useTripContext } from '../contexts/TripContext';
import { useAuthContext } from '../contexts/AuthContext';

export const useTrips = () => {
  const { user } = useAuthContext();
  const tripContext = useTripContext();
  const [loading, setLoading] = useState(false);

  const create = useCallback(async (trip: Omit<Trip, 'id' | 'created_at' | 'updated_at' | 'owner_id'>) => {
    if (!user) throw new Error('Nicht angemeldet');
    setLoading(true);
    try {
      const newTrip = await tripsApi.createTrip({ ...trip, owner_id: user.id });
      await tripContext.fetchTrips();
      return newTrip;
    } finally {
      setLoading(false);
    }
  }, [user, tripContext.fetchTrips]);

  const update = useCallback(async (tripId: string, updates: Partial<Trip>) => {
    setLoading(true);
    try {
      const updated = await tripsApi.updateTrip(tripId, updates);
      await tripContext.fetchTrips();
      return updated;
    } finally {
      setLoading(false);
    }
  }, [tripContext.fetchTrips]);

  const remove = useCallback(async (tripId: string) => {
    setLoading(true);
    try {
      await tripsApi.deleteTrip(tripId);
      await tripContext.fetchTrips();
    } finally {
      setLoading(false);
    }
  }, [tripContext.fetchTrips]);

  return {
    ...tripContext,
    loading: tripContext.loading || loading,
    create,
    update,
    remove,
  };
};
