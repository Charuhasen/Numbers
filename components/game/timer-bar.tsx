import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  SharedValue,
  cancelAnimation,
  interpolateColor,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface TimerBarProps {
  /** Progress from 1.0 (full) to 0.0 (empty) — Reanimated shared value */
  progress: SharedValue<number>;
  /** Total timer duration in seconds, used to derive the countdown number */
  durationSec: number;
}

export const TimerBar = React.memo(function TimerBar({ progress, durationSec }: TimerBarProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  // Pulse opacity — animates when ≤ 3 s remain
  const pulseOpacity = useSharedValue(1);

  useAnimatedReaction(
    () => progress.value * durationSec,
    (secondsLeft, prev) => {
      // "in zone" = timer is running and ≤ 3 s remain
      const inZone = secondsLeft <= 3 && secondsLeft > 0;
      const wasInZone = prev !== null && prev <= 3 && prev > 0;

      if (inZone && !wasInZone) {
        // Just entered the last-3-seconds zone — start pulsing
        pulseOpacity.value = withRepeat(
          withSequence(
            withTiming(0.35, { duration: 350 }),
            withTiming(1, { duration: 350 }),
          ),
          -1,
          false,
        );
      } else if (!inZone && wasInZone) {
        // Left the zone (expired or new board reset above 3 s) — stop pulsing
        cancelAnimation(pulseOpacity);
        pulseOpacity.value = 1;
      }
    },
    [durationSec],
  );

  const animatedBarStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      progress.value,
      [0, 0.33, 1],
      [theme.error, theme.error, theme.primary],
    );
    return {
      width: `${progress.value * 100}%` as `${number}%`,
      backgroundColor: color,
      opacity: pulseOpacity.value,
    };
  });

  const animatedTextProps = useAnimatedProps(() => ({
    text: `${Math.ceil(progress.value * durationSec)}`,
    defaultValue: `${durationSec}`,
  }));

  return (
    <View style={styles.row}>
      <View style={[styles.track, { backgroundColor: theme.surfaceDim }]}>
        <Animated.View style={[styles.fill, animatedBarStyle]} />
      </View>
      <AnimatedTextInput
        animatedProps={animatedTextProps}
        editable={false}
        style={[styles.countdown, { color: theme.onSurfaceVariant }]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  countdown: {
    fontSize: 14,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'right',
  },
});
