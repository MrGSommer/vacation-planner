import { useEffect, useRef } from 'react';
import { supabase } from '../api/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Subscribe to INSERT events on ai_trip_messages via Supabase Realtime.
 * Content is encrypted (bytea) so Realtime only delivers metadata fields.
 * The consumer must fetch decrypted content via RPC.
 */
export function useAiRealtime(
  tripId: string | undefined,
  enabled: boolean,
  onNewMessage: (messageId: string, senderId: string) => void,
): void {
  const callbackRef = useRef(onNewMessage);
  callbackRef.current = onNewMessage;

  useEffect(() => {
    if (!tripId || !enabled) return;

    const channel: RealtimeChannel = supabase
      .channel(`ai_messages:${tripId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ai_trip_messages',
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, any>;
          if (row?.id && row?.sender_id) {
            callbackRef.current(row.id, row.sender_id);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, enabled]);
}

/**
 * Broadcast typing events via Supabase Realtime Broadcast (ephemeral, no DB).
 * Returns helpers to broadcast own typing and listen for others.
 */
export function useAiTypingBroadcast(
  tripId: string | undefined,
  userId: string,
  userName: string,
  enabled: boolean,
  onTypingChange: (typingUsers: string[]) => void,
): { broadcastTyping: (isTyping: boolean) => void } {
  const callbackRef = useRef(onTypingChange);
  callbackRef.current = onTypingChange;
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingMapRef = useRef<Map<string, { name: string; timeout: ReturnType<typeof setTimeout> }>>(new Map());

  useEffect(() => {
    if (!tripId || !enabled) return;

    const channel = supabase.channel(`typing:${tripId}`, {
      config: { broadcast: { self: false } },
    });

    channel.on('broadcast', { event: 'typing' }, (payload) => {
      const msg = payload.payload as { userId: string; userName: string; isTyping: boolean };
      if (msg.userId === userId) return;

      const map = typingMapRef.current;

      // Clear existing timeout for this user
      const existing = map.get(msg.userId);
      if (existing) clearTimeout(existing.timeout);

      if (msg.isTyping) {
        // Auto-clear after 5s of inactivity
        const timeout = setTimeout(() => {
          map.delete(msg.userId);
          callbackRef.current(Array.from(map.values()).map(v => v.name));
        }, 5000);
        map.set(msg.userId, { name: msg.userName, timeout });
      } else {
        map.delete(msg.userId);
      }

      callbackRef.current(Array.from(map.values()).map(v => v.name));
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      // Clear all typing timeouts
      for (const entry of typingMapRef.current.values()) {
        clearTimeout(entry.timeout);
      }
      typingMapRef.current.clear();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [tripId, userId, enabled]);

  const broadcastTyping = (isTyping: boolean) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, userName, isTyping },
    });
  };

  return { broadcastTyping };
}
