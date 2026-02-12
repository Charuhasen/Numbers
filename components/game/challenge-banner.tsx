import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface ChallengeBannerProps {
  challengeNumber: number;
  instruction: string;
  onDismiss: () => void;
}

const DISPLAY_DURATION = 2000;

export function ChallengeBanner({
  challengeNumber,
  instruction,
  onDismiss,
}: ChallengeBannerProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const progressWidth = useSharedValue(100);
  const [countdown, setCountdown] = useState(Math.ceil(DISPLAY_DURATION / 1000));
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    progressWidth.value = withTiming(0, {
      duration: DISPLAY_DURATION,
      easing: Easing.linear,
    });

    // Update the numeric countdown every 100ms for smooth display
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, DISPLAY_DURATION - elapsed);
      setCountdown(Math.ceil(remaining / 1000));
    }, 100);

    const timeout = setTimeout(onDismiss, DISPLAY_DURATION);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [onDismiss, progressWidth]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%` as `${number}%`,
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.overlay}
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
        style={[styles.card, { backgroundColor: theme.surfaceVariant }]}
      >
        <Text style={[styles.label, { color: theme.primary }]}>
          CHALLENGE {challengeNumber}
        </Text>
        <Text style={[styles.instruction, { color: theme.onSurface }]}>
          {instruction}
        </Text>
        <Text style={[styles.countdown, { color: theme.primary }]}>
          {countdown}
        </Text>
        <View style={[styles.progressTrack, { backgroundColor: theme.surfaceDim }]}>
          <Animated.View
            style={[styles.progressFill, progressStyle, { backgroundColor: theme.primary }]}
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 100,
  },
  card: {
    paddingVertical: 28,
    paddingHorizontal: 36,
    borderRadius: 20,
    alignItems: 'center',
    gap: 10,
    minWidth: 260,
    overflow: 'hidden',
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.5,
  },
  instruction: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  countdown: {
    fontSize: 32,
    fontWeight: '800',
    marginTop: 4,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
});
