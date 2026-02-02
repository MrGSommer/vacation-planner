import { useEffect } from 'react';
import { supabase } from '../api/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

type TableName = 'activities' | 'expenses' | 'packing_items' | 'photos';

export interface RealtimePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, any> | null;
  old: Record<string, any> | null;
}

export const useRealtime = (
  table: TableName,
  filter: string,
  callback: (payload?: RealtimePayload) => void
) => {
  useEffect(() => {
    const channel: RealtimeChannel = supabase
      .channel(`${table}_changes`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter },
        (payload) => {
          callback({
            eventType: payload.eventType as RealtimePayload['eventType'],
            new: payload.new as Record<string, any> | null,
            old: payload.old as Record<string, any> | null,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, callback]);
};
