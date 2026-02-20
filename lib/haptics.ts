import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoHaptics from 'expo-haptics';

const STORAGE_KEY = 'taptapmath_haptics_enabled';

// Module-level flag — loaded once at startup, updated instantly on toggle.
// Defaults to true so haptics work before the preference has been read.
let enabled = true;

/** Call once during app bootstrap (e.g. splash screen) to restore the saved preference. */
export async function loadHapticsPreference(): Promise<void> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (stored !== null) enabled = stored === 'true';
}

/** Persist and apply the user's preference. */
export async function setHapticsEnabled(value: boolean): Promise<void> {
  enabled = value;
  await AsyncStorage.setItem(STORAGE_KEY, String(value));
}

/** Read the current in-memory value (synchronous). */
export function isHapticsEnabled(): boolean {
  return enabled;
}

/** Impact feedback — respects the user's vibration preference. */
export function impact(style: ExpoHaptics.ImpactFeedbackStyle): void {
  if (!enabled) return;
  ExpoHaptics.impactAsync(style);
}

/** Notification feedback — respects the user's vibration preference. */
export function notification(type: ExpoHaptics.NotificationFeedbackType): void {
  if (!enabled) return;
  ExpoHaptics.notificationAsync(type);
}
