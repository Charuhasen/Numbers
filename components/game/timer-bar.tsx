import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  interpolateColor,
} from 'react-native-reanimated';

interface TimerBarProps {
  /** Progress from 1.0 (full) to 0.0 (empty) — Reanimated shared value */
  progress: SharedValue<number>;
}

export const TimerBar = React.memo(function TimerBar({ progress }: TimerBarProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const animatedStyle = useAnimatedStyle(() => {
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

  return (
    <View style={[styles.track, { backgroundColor: theme.surfaceDim }]}>
      <Animated.View style={[styles.fill, animatedStyle]} />
    </View>
  );
});

const styles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: 3,
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});
