import { Platform } from 'react-native';

/**
 * iOS Safari/PWA plays Web Audio on the "ringer" channel which respects
 * the hardware mute switch. Playing a silent <audio> element forces iOS
 * to switch to the "playback" audio session, bypassing the mute switch.
 *
 * Must be called inside a user gesture handler (tap/click).
 * Works on all platforms — no-op on non-web.
 */

// Tiny 1-sample silent WAV (44 bytes)
const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

let silentAudio: HTMLAudioElement | null = null;
let unlocked = false;

/** Call on first user tap to unlock audio on iOS + resume AudioContext on all browsers */
export function unlockWebAudio(): void {
  if (Platform.OS !== 'web' || unlocked) return;

  // Resume any suspended AudioContext (Chrome, Safari autoplay policy)
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
      // Play silent buffer to fully unlock
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    }
  } catch {}

  // Silent <audio> element trick — switches iOS audio session from
  // "ambient" (mute switch respected) to "playback" (mute switch ignored)
  if (!silentAudio) {
    silentAudio = new Audio(SILENT_WAV);
    silentAudio.setAttribute('playsinline', 'true');
    silentAudio.setAttribute('webkit-playsinline', 'true');
    silentAudio.loop = true;
    silentAudio.volume = 0;
  }
  silentAudio.play().catch(() => {});

  unlocked = true;
}

/** Call when audio is no longer needed (screen unmount) */
export function lockWebAudio(): void {
  if (silentAudio) {
    silentAudio.pause();
    silentAudio.src = '';
    silentAudio = null;
  }
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
