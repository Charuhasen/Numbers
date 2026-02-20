import { Colors } from '@/constants/theme';
import { useProfile } from '@/context/profile-ctx';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadHapticsPreference } from '@/lib/haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export default function SplashScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { profile, isLoading } = useProfile();
  const hasNavigated = useRef(false);
  const [profileReady, setProfileReady] = useState(false);
  const [timerReady, setTimerReady] = useState(false);

  // Fade-in animation
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 400 });
    translateY.value = withDelay(100, withTiming(0, { duration: 400 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  // Minimum 2-second display time + bootstrap side-effects
  useEffect(() => {
    loadHapticsPreference();
    const timer = setTimeout(() => setTimerReady(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Track when profile has finished loading
  useEffect(() => {
    if (!isLoading) setProfileReady(true);
  }, [isLoading]);

  // Navigate only when both the timer and profile are ready
  useEffect(() => {
    if (!profileReady || !timerReady || hasNavigated.current) return;
    hasNavigated.current = true;

    const hasValidUsername = USERNAME_RE.test(profile?.username ?? '');
    if (hasValidUsername) {
      router.replace('/');
    } else {
      router.replace('/(setup)/username');
    }
  }, [profileReady, timerReady, profile?.username]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <Animated.View style={[styles.content, animStyle]}>
        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : '#DBEAFE' }]}>
          <Text style={styles.iconEmoji}>🧮</Text>
        </View>

        {/* Wordmark */}
        <Text style={[styles.wordmark, { color: theme.onSurface }]}>
          TapTap<Text style={{ color: '#3B82F6' }}>Math</Text>
        </Text>

        <Text style={[styles.tagline, { color: theme.onSurfaceVariant }]}>
          Train your brain
        </Text>
      </Animated.View>

      {/* Loader pinned to bottom */}
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="small" color={theme.onSurfaceVariant} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 16,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  iconEmoji: {
    fontSize: 44,
  },
  wordmark: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
    fontWeight: '400',
  },
  loaderWrap: {
    position: 'absolute',
    bottom: 48,
  },
});
