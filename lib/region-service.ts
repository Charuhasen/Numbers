import * as Location from 'expo-location';

import { supabase } from '@/lib/supabase';

/**
 * Detect the user's country code using GPS (preferred) with IP geolocation as fallback.
 * Persists the result to profiles.country_code and returns the ISO 3166-1 alpha-2 code.
 * Safe to call fire-and-forget — never throws.
 */
export async function detectAndSaveRegion(userId: string): Promise<string | null> {
  let countryCode: string | null = null;

  // --- 1. GPS + reverse geocode (most accurate) ---
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status === 'granted') {
      // Use last known position first (instant, no battery hit).
      // Fall back to a fresh low-accuracy fix if none is cached.
      let position = await Location.getLastKnownPositionAsync();
      if (!position) {
        position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Lowest, // country-level only, fastest/cheapest
        });
      }

      const [geocoded] = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      countryCode = geocoded?.isoCountryCode ?? null;
    }
  } catch {
    // GPS unavailable or permission denied — fall through to IP
  }

  // --- 2. IP geolocation fallback ---
  if (!countryCode) {
    try {
      const res = await fetch('https://ipapi.co/json/');
      if (res.ok) {
        const data = await res.json() as { country_code?: string };
        countryCode = data.country_code ?? null;
      }
    } catch {
      // Network unavailable — nothing to do
    }
  }

  // --- 3. Persist to profile ---
  if (countryCode) {
    try {
      await supabase
        .from('profiles')
        .update({ country_code: countryCode })
        .eq('id', userId);
    } catch {
      // Non-fatal — will retry next launch
    }
  }

  return countryCode;
}
