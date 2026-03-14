import { Platform } from 'react-native';

/**
 * Unlock Web Audio API on first user gesture (tap/click).
 * Resumes suspended AudioContext — no silent <audio> loop needed.
 * The real music HTMLAudioElement must be started directly in the
 * gesture handler for PWA standalone mode compatibility.
 *
 * Works on all platforms — no-op on non-web.
 */

let unlocked = false;

/** Call on first user tap to resume AudioContext on all browsers */
export function unlockWebAudio(): void {
  if (Platform.OS !== 'web' || unlocked) return;

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
    }
  } catch {}

  unlocked = true;
}

/** Call when audio is no longer needed (screen unmount) */
export function lockWebAudio(): void {
  unlocked = false;
}

/**
 * Create an HTMLAudioElement configured for reliable cross-platform playback.
 * Returns the element — caller is responsible for .play() and cleanup.
 */
export function createWebAudioPlayer(url: string, options?: { loop?: boolean; volume?: number }): HTMLAudioElement {
  const audio = new Audio();
  audio.setAttribute('playsinline', 'true');
  audio.setAttribute('webkit-playsinline', 'true');
  audio.preload = 'auto';
  audio.loop = options?.loop ?? false;
  audio.volume = options?.volume ?? 1;
  audio.src = url;
  return audio;
}
