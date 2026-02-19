import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  interpolateColor,
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

  const animatedBarStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      progress.value,
      [0, 0.33, 1],
      [theme.error, theme.error, theme.primary],
    );
    return {
      width: `${progress.value * 100}%` as `${number}%`,
      backgroundColor: color,
    };
  });

  // Drive the seconds text directly from the shared value — no React re-renders
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
