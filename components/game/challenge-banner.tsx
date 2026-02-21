import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import React, { useEffect } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface ChallengeBannerProps {
  challengeNumber: number;
  instruction: string;
  onDismiss: () => void;
}

const DISPLAY_DURATION = 4000;

export function ChallengeBanner({
  challengeNumber,
  instruction,
  onDismiss,
}: ChallengeBannerProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const progressWidth = useSharedValue(100);
  const pulse = useSharedValue(0); // 0 = primary colour, 1 = error/red

  useEffect(() => {
    progressWidth.value = withTiming(0, {
      duration: DISPLAY_DURATION,
      easing: Easing.linear,
    });

    // Blink countdown from the very start
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0, { duration: 400 }),
      ),
      -1,
      false,
    );

    const timeout = setTimeout(onDismiss, DISPLAY_DURATION);
    return () => {
      clearTimeout(timeout);
    };
  }, [onDismiss, progressWidth, pulse]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%` as `${number}%`,
  }));

  const pulseColorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(pulse.value, [0, 1], [theme.primary, theme.error]),
  }));

  const progressFillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      pulse.value,
      [0, 1],
      [theme.primary, theme.error],
    ),
  }));

  // Countdown text driven entirely on the UI thread — no setInterval, no React state
  const countdownProps = useAnimatedProps(() => {
    const remaining = Math.ceil((progressWidth.value / 100) * DISPLAY_DURATION / 1000);
    const val = Math.max(0, remaining).toString();
    return { text: val, defaultValue: val };
  });

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
        {/* Countdown on UI thread via AnimatedProps — no React state updates */}
        <AnimatedTextInput
          animatedProps={countdownProps}
          editable={false}
          style={[styles.countdown, pulseColorStyle]}
        />
        <View style={[styles.progressTrack, { backgroundColor: theme.surfaceDim }]}>
          <Animated.View
            style={[styles.progressFill, progressStyle, progressFillStyle]}
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
    textAlign: 'center',
    minWidth: 40,
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
