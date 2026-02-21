import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import 'react-native-reanimated';
import 'react-native-url-polyfill/auto';

import { SessionProvider, useSession } from '@/context/ctx';
import { ProfileProvider } from '@/context/profile-ctx';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, isLoading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  // Prevents redirecting to splash more than once per session lifecycle
  const splashShown = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session) {
      // Reset so next sign-in gets a fresh splash
      splashShown.current = false;
      if (!inAuthGroup) router.replace('/(auth)/sign-in');
      return;
    }

    // Session exists — send to splash once (handles profile load + username check)
    if (!splashShown.current) {
      splashShown.current = true;
      router.replace('/splash');
    }
  }, [isLoading, session]);

  const bgColor = Colors[colorScheme ?? 'light'].surface;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ contentStyle: { backgroundColor: bgColor } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(setup)" options={{ headerShown: false }} />
        <Stack.Screen name="splash" options={{ headerShown: false }} />
        <Stack.Screen name="game" options={{ headerShown: false }} />
        <Stack.Screen name="friends" options={{ headerShown: false }} />
        <Stack.Screen name="leaderboard" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <ProfileProvider>
        <RootLayoutNav />
      </ProfileProvider>
    </SessionProvider>
  );
}
