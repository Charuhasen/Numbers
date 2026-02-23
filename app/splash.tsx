import { Colors } from '@/constants/theme';
import { useProfile } from '@/context/profile-ctx';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadHapticsPreference } from '@/lib/haptics';
import { detectAndSaveRegion } from '@/lib/region-service';
import { MaterialIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  const { profile, isLoading, refreshProfile } = useProfile();
  const hasNavigated = useRef(false);
  const [profileReady, setProfileReady] = useState(false);
  const [timerReady, setTimerReady] = useState(false);
  const [regionReady, setRegionReady] = useState(false);

  // Network State
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isCheckingNetwork, setIsCheckingNetwork] = useState(true);

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

  const checkNetwork = useCallback(async () => {
    setIsCheckingNetwork(true);
    
    // Add artificial delay for UX feedback so the user sees it actually checking
    const [state] = await Promise.all([
      NetInfo.fetch(),
      new Promise((res) => setTimeout(res, 600)),
    ]);
    
    const online = !!state.isConnected;
    setIsConnected(online);
    
    // Regardless of online/offline status, we try to refresh profile. 
    // profile-ctx will now gracefully fall back to local DB if offline.
    try {
      await refreshProfile();
    } catch (err) {}

    setIsCheckingNetwork(false);
  }, [refreshProfile]);

  // Initial network check
  useEffect(() => {
    checkNetwork();
  }, [checkNetwork]);

  // Always kick off timer immediately so we don't wait 2s on every retry
  useEffect(() => {
    loadHapticsPreference();
    const timer = setTimeout(() => setTimerReady(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Track when profile has finished loading
  useEffect(() => {
    if (!isLoading) setProfileReady(true);
  }, [isLoading]);

  // Detect and persist region every launch.
  // Starts once the profile is loaded (userId available).
  // A 6-second safety timeout prevents GPS permission dialogs from blocking
  // the splash indefinitely. Navigation waits for this to resolve.
  useEffect(() => {
    if (!profileReady || !profile?.id) return;

    const userId = profile.id;
    let settled = false;

    const done = () => {
      if (!settled) {
        settled = true;
        setRegionReady(true);
      }
    };

    // Safety net — unblock navigation if detection stalls
    const timeout = setTimeout(done, 6000);

    detectAndSaveRegion(userId)
      .then(async (code) => {
        if (code) await refreshProfile();
      })
      .finally(() => {
        clearTimeout(timeout);
        done();
      });

    return () => {
      clearTimeout(timeout);
      settled = true; // prevent state update after unmount
    };
  }, [profileReady, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate only when timer, profile, and region detection are all done
  useEffect(() => {
    if (!profileReady || !timerReady || hasNavigated.current) return;
    
    // Safety net - wait for region ready if possible, but don't block forever if offline.
    // If we are completely offline, region detection might fail instantly or stall.
    if (!regionReady && isConnected !== false) return;

    hasNavigated.current = true;

    const hasValidUsername = USERNAME_RE.test(profile?.username ?? '');
    if (hasValidUsername) {
      router.replace('/');
    } else {
      router.replace('/(setup)/username');
    }
  }, [profileReady, timerReady, regionReady, profile?.id, profile?.username, isConnected]);

  // We no longer show an Offline blocker because the app is Offline-First.
  const showOfflineUI = false;

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

      <View style={styles.bottomWrap}>
        {showOfflineUI ? (
          <Animated.View style={[styles.offlineWrap, animStyle]}>
            <View style={styles.offlineHeader}>
              <MaterialIcons name="cloud-off" size={20} color={theme.error} />
              <Text style={[styles.offlineText, { color: theme.error }]}>
                {isConnected === false ? "No Internet Connection" : "Connection Failed"}
              </Text>
            </View>
            
            <TouchableOpacity 
              style={[styles.reconnectButton, { backgroundColor: theme.primary }]}
              onPress={checkNetwork}
              activeOpacity={0.8}
              disabled={isCheckingNetwork}
            >
              {isCheckingNetwork ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.reconnectText}>Reconnect</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <ActivityIndicator size="small" color={theme.onSurfaceVariant} />
        )}
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
  bottomWrap: {
    position: 'absolute',
    bottom: 48,
    alignItems: 'center',
    width: '100%',
  },
  offlineWrap: {
    alignItems: 'center',
    gap: 16,
  },
  offlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  offlineText: {
    fontSize: 15,
    fontWeight: '600',
  },
  reconnectButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 140,
    alignItems: 'center',
  },
  reconnectText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
