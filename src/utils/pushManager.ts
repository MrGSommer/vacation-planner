import { Platform } from 'react-native';
import { supabase } from '../api/supabase';

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return Platform.OS === 'web' && 'serviceWorker' in navigator && 'PushManager' in window;
}

export function getPushPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) return 'denied';
  return await Notification.requestPermission();
}

export async function subscribeToPush(userId: string): Promise<boolean> {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) return false;

  try {
    const permission = await requestPushPermission();
    if (permission !== 'granted') return false;

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
      });
    }

    const key = subscription.getKey('p256dh');
    const auth = subscription.getKey('auth');
    if (!key || !auth) return false;

    const p256dh = btoa(String.fromCharCode(...new Uint8Array(key)));
    const authKey = btoa(String.fromCharCode(...new Uint8Array(auth)));

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: p256dh,
        auth: authKey,
      },
      { onConflict: 'user_id,endpoint' }
    );

    if (error) {
      console.error('Failed to store push subscription:', error);
      return false;
    }

    return true;
  } catch (e) {
    console.error('Push subscription error:', e);
    return false;
  }
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  if (!isPushSupported()) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', subscription.endpoint);
      await subscription.unsubscribe();
    }
  } catch (e) {
    console.error('Push unsubscribe error:', e);
  }
}
