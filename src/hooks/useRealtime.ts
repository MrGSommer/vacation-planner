import { useEffect } from 'react';
import { supabase } from '../api/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

type TableName = 'activities' | 'expenses' | 'packing_items' | 'photos';

export const useRealtime = (
  table: TableName,
  filter: string,
  callback: () => void
) => {
  useEffect(() => {
    const channel: RealtimeChannel = supabase
      .channel(`${table}_changes`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter },
        () => { callback(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, callback]);
};
