import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../api/supabase';
import { useAuthContext } from '../contexts/AuthContext';
import { getDisplayName } from '../utils/profileHelpers';

export interface PresenceUser {
  userId: string;
  name: string;
  avatarUrl: string | null;
  screen: string;
}

export const usePresence = (tripId: string, currentScreen: string) => {
  const { user, profile } = useAuthContext();
  const [others, setOthers] = useState<PresenceUser[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!tripId || !user) return;

    const channel = supabase.channel(`presence:${tripId}`, {
      config: { presence: { key: user.id } },
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<{ userId: string; name: string; avatarUrl: string | null; screen: string }>();
      const users: PresenceUser[] = [];
      for (const [key, presences] of Object.entries(state)) {
        if (key === user.id) continue;
        const latest = presences[presences.length - 1];
        if (latest) {
          users.push({
            userId: latest.userId,
            name: latest.name,
            avatarUrl: latest.avatarUrl,
            screen: latest.screen,
          });
        }
      }
      setOthers(users);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          userId: user.id,
          name: profile ? getDisplayName(profile) : 'Gast',
          avatarUrl: profile?.avatar_url || null,
          screen: currentScreen,
        });
      }
    });

    channelRef.current = channel;

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [tripId, user, profile]);

  // Update screen when it changes
  useEffect(() => {
    if (!channelRef.current || !user || !profile) return;
    channelRef.current.track({
      userId: user.id,
      name: getDisplayName(profile),
      avatarUrl: profile?.avatar_url || null,
      screen: currentScreen,
    });
  }, [currentScreen, user, profile]);

  return others;
};
