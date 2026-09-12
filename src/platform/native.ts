import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar } from '@capacitor/status-bar';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { Howler } from 'howler';

/**
 * Native shell behaviour when running inside Capacitor: landscape lock, immersive status bar, wake lock,
 * hardware back button → pause menu, and audio-session handling for calls/headphones/backgrounding.
 * Every call is guarded so the same build runs unchanged in a plain browser / PWA.
 */
export const isNative = (): boolean => Capacitor.isNativePlatform();

export const initNativeShell = async (): Promise<void> => {
  if (!isNative()) {
    // Browser: best-effort wake lock while the tab is visible.
    try {
      const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<unknown> } };
      if (nav.wakeLock) await nav.wakeLock.request('screen');
    } catch {
      /* wake lock refused: the game still runs */
    }
    return;
  }
  try {
    await ScreenOrientation.lock({ orientation: 'landscape' });
  } catch {
    /* orientation lock unsupported on this device */
  }
  try {
    await StatusBar.hide();
    await StatusBar.setOverlaysWebView({ overlay: true });
  } catch {
    /* status bar plugin unavailable (web) */
  }
  try {
    await KeepAwake.keepAwake();
  } catch {
    /* keep-awake unavailable */
  }
  // Hardware back button: the pause menu owns it (it also closes the map/journal when open).
  await App.addListener('backButton', () => {
    window.dispatchEvent(new CustomEvent('eka:back'));
  });
  // Calls / headphone changes / backgrounding: suspend and resume the audio context cleanly.
  await App.addListener('appStateChange', ({ isActive }) => {
    const ctx = Howler.ctx as AudioContext | null;
    if (!ctx) return;
    if (isActive) void ctx.resume();
    else void ctx.suspend();
  });
};
