import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (__DEV__ && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn(
    'Supabase config missing: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set in .env. ' +
    'Copy .env.example to .env and fill in your credentials.'
  );
}

// SecureStore has a 2048-byte limit per key. Large Supabase session objects
// (JWT + user metadata) routinely exceed this, so we chunk them.
const CHUNK_SIZE = 2000;

const ExpoSecureStoreAdapter = {
    async getItem(key: string): Promise<string | null> {
        const chunksStr = await SecureStore.getItemAsync(`${key}.chunks`);
        if (!chunksStr) {
            // Value was stored unchunked (small enough to fit in one key)
            return SecureStore.getItemAsync(key);
        }
        const total = parseInt(chunksStr, 10);
        let value = '';
        for (let i = 0; i < total; i++) {
            const chunk = await SecureStore.getItemAsync(`${key}.chunk_${i}`);
            if (chunk === null) return null;
            value += chunk;
        }
        return value;
    },

    async setItem(key: string, value: string): Promise<void> {
        if (value.length <= CHUNK_SIZE) {
            await SecureStore.setItemAsync(key, value);
            // Remove any leftover chunks from a previous larger value
            await SecureStore.deleteItemAsync(`${key}.chunks`);
            return;
        }
        const total = Math.ceil(value.length / CHUNK_SIZE);
        for (let i = 0; i < total; i++) {
            await SecureStore.setItemAsync(
                `${key}.chunk_${i}`,
                value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
            );
        }
        await SecureStore.setItemAsync(`${key}.chunks`, String(total));
        // Remove the plain key in case a previous value was stored unchunked
        await SecureStore.deleteItemAsync(key);
    },

    async removeItem(key: string): Promise<void> {
        const chunksStr = await SecureStore.getItemAsync(`${key}.chunks`);
        if (chunksStr) {
            const total = parseInt(chunksStr, 10);
            for (let i = 0; i < total; i++) {
                await SecureStore.deleteItemAsync(`${key}.chunk_${i}`);
            }
            await SecureStore.deleteItemAsync(`${key}.chunks`);
        }
        await SecureStore.deleteItemAsync(key);
    },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: Platform.OS === 'web' ? AsyncStorage : ExpoSecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});
