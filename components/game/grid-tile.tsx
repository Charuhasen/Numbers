import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { impact } from '@/lib/haptics';
import { ImpactFeedbackStyle } from 'expo-haptics';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export type TileFeedback = 'idle' | 'correct' | 'wrong';

interface GridTileProps {
  number: number;
  tileIndex: number;
  feedbackValues: SharedValue<TileFeedback[]>;
  onTap: (index: number) => void;
  disabled: boolean;
  size: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const GridTile = React.memo(function GridTile({
  number,
  tileIndex,
  feedbackValues,
  onTap,
  disabled,
  size,
}: GridTileProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const scale = useSharedValue(1);

  // Capture theme colors so worklets can close over them
  const successColor = theme.success;
  const errorColor = theme.error;
  const surfaceColor = theme.surfaceVariant;
  const onSurfaceColor = theme.onSurface;

  const handlePressIn = useCallback(() => {
    if (disabled) return;
    scale.value = withSequence(
      withTiming(0.92, { duration: 50 }),
      withSpring(1, { damping: 15, stiffness: 300 }),
    );
    impact(ImpactFeedbackStyle.Light);
    onTap(tileIndex);
  }, [disabled, onTap, scale, tileIndex]);

  // Background + scale animate on UI thread — no React re-render needed
  const bgAnimStyle = useAnimatedStyle(() => {
    const fb = feedbackValues.value[tileIndex] ?? 'idle';
    return {
      transform: [{ scale: scale.value }],
      backgroundColor:
        fb === 'correct' ? successColor : fb === 'wrong' ? errorColor : surfaceColor,
    };
  });

  // Text color also on UI thread
  const textAnimStyle = useAnimatedStyle(() => {
    const fb = feedbackValues.value[tileIndex] ?? 'idle';
    return {
      color: fb === 'correct' || fb === 'wrong' ? '#FFFFFF' : onSurfaceColor,
    };
  });

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      disabled={disabled}
      style={[
        styles.tile,
        bgAnimStyle,
        {
          width: size,
          height: size,
          borderRadius: Spacing.tileRadius,
        },
      ]}
    >
      <Animated.Text
        style={[styles.number, textAnimStyle]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {number}
      </Animated.Text>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  tile: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  number: {
    fontSize: 28,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
});
