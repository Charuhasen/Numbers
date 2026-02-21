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
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

const FREEZE_COLOR = '#42A5F5'; // bright blue for frozen state

interface TimerBarProps {
  /** Progress from 1.0 (full) to 0.0 (empty) — OR seconds remaining when isGlobal */
  progress: SharedValue<number>;
  /** Total timer duration in seconds, used to derive the countdown number */
  durationSec: number;
  /** When true, `progress` is in seconds (60→0) instead of normalized (1→0) */
  isGlobal?: boolean;
  /** 0 = not frozen, 1 = frozen (Time Freeze potion active) */
  frozen?: SharedValue<number>;
}

export const TimerBar = React.memo(function TimerBar({ progress, durationSec, isGlobal, frozen }: TimerBarProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  // Normalize progress to 0-1 range regardless of mode
  const normalizedProgress = useDerivedValue(() => {
    if (isGlobal) {
      return Math.max(0, Math.min(1, progress.value / durationSec));
    }
    return progress.value;
  });

  // Pulse opacity — animates when ≤ 3 s remain OR when frozen
  const pulseOpacity = useSharedValue(1);

  // Track frozen state for pulsing
  useAnimatedReaction(
    () => frozen?.value ?? 0,
    (isFrozen, wasFrozen) => {
      if (isFrozen === 1 && (wasFrozen === null || wasFrozen === 0)) {
        // Start frozen pulse
        pulseOpacity.value = withRepeat(
          withSequence(
            withTiming(0.5, { duration: 600 }),
            withTiming(1, { duration: 600 }),
          ),
          -1,
          false,
        );
      } else if (isFrozen === 0 && wasFrozen === 1) {
        // Stop frozen pulse — resume normal
        cancelAnimation(pulseOpacity);
        pulseOpacity.value = 1;
      }
    },
  );

  // Track low-time pulsing (only when not frozen)
  useAnimatedReaction(
    () => ({
      secondsLeft: normalizedProgress.value * durationSec,
      isFrozen: frozen?.value ?? 0,
    }),
    (cur, prev) => {
      // Don't pulse for low time when frozen — the frozen pulse takes precedence
      if (cur.isFrozen === 1) return;

      const inZone = cur.secondsLeft <= 3 && cur.secondsLeft > 0;
      const wasInZone = prev !== null && prev.secondsLeft <= 3 && prev.secondsLeft > 0;

      if (inZone && !wasInZone) {
        pulseOpacity.value = withRepeat(
          withSequence(
            withTiming(0.35, { duration: 350 }),
            withTiming(1, { duration: 350 }),
          ),
          -1,
          false,
        );
      } else if (!inZone && wasInZone) {
        cancelAnimation(pulseOpacity);
        pulseOpacity.value = 1;
      }
    },
    [durationSec],
  );

  const animatedBarStyle = useAnimatedStyle(() => {
    const isFrozen = (frozen?.value ?? 0) === 1;
    const color = isFrozen
      ? FREEZE_COLOR
      : interpolateColor(
          normalizedProgress.value,
          [0, 0.33, 1],
          [theme.error, theme.error, theme.primary],
        );
    return {
      width: `${normalizedProgress.value * 100}%` as `${number}%`,
      backgroundColor: color,
      opacity: pulseOpacity.value,
    };
  });

  const animatedTextProps = useAnimatedProps(() => ({
    text: `${Math.ceil(normalizedProgress.value * durationSec)}`,
    defaultValue: `${durationSec}`,
  }));

  const animatedTextStyle = useAnimatedStyle(() => {
    const isFrozen = (frozen?.value ?? 0) === 1;
    return {
      color: isFrozen ? FREEZE_COLOR : theme.onSurfaceVariant,
    };
  });

  return (
    <View style={styles.row}>
      <View style={[styles.track, { backgroundColor: theme.surfaceDim }]}>
        <Animated.View style={[styles.fill, animatedBarStyle]} />
      </View>
      <AnimatedTextInput
        animatedProps={animatedTextProps}
        editable={false}
        style={[styles.countdown, animatedTextStyle]}
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
