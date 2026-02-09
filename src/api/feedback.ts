import { supabase } from './supabase';
import { Platform, Dimensions } from 'react-native';
import appJson from '../../app.json';

export interface BetaFeedback {
  id: string;
  user_id: string;
  type: 'bug' | 'feature' | 'feedback' | 'question';
  title: string;
  description: string;
  screen_name: string | null;
  device_info: string | null;
  app_version: string | null;
  status: 'new' | 'in_progress' | 'resolved' | 'wont_fix';
  created_at: string;
}

function getDeviceInfo(): string {
  const { width, height } = Dimensions.get('window');
  const os = Platform.OS;
  let info = `${os} ${width}x${height}`;
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    info += ` ${navigator.userAgent.split(' ').slice(-2).join(' ')}`;
  }
  return info;
}

export async function submitFeedback(data: {
  type: 'bug' | 'feature' | 'feedback' | 'question';
  title: string;
  description: string;
  screenName?: string;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht angemeldet');

  const { error } = await supabase.from('beta_feedback').insert({
    user_id: user.id,
    type: data.type,
    title: data.title,
    description: data.description,
    screen_name: data.screenName || null,
    device_info: getDeviceInfo(),
    app_version: appJson.expo.version,
  });

  if (error) throw error;
}

export async function getMyFeedback(): Promise<BetaFeedback[]> {
  const { data, error } = await supabase
    .from('beta_feedback')
    .select('id, user_id, type, title, description, screen_name, device_info, app_version, status, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}
