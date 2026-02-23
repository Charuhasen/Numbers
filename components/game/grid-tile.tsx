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

export type TileFeedback = 'idle' | 'correct' | 'wrong' | 'hidden' | 'glow';

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
  const isDark = colorScheme === 'dark';
  const scale = useSharedValue(1);

  // Capture theme colors so worklets can close over them
  const successColor = theme.success;
  const errorColor = theme.error;
  const surfaceColor = theme.surfaceVariant;
  const onSurfaceColor = theme.onSurface;
  // Subtle glow: slightly lighter/brighter version of surface
  const glowColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)';

  const handlePressIn = useCallback(() => {
    if (disabled || feedbackValues.value[tileIndex] === 'hidden') return;
    scale.value = withSequence(
      withTiming(0.92, { duration: 50 }),
      withSpring(1, { damping: 15, stiffness: 300 }),
    );
    impact(ImpactFeedbackStyle.Light);
    onTap(tileIndex);
  }, [disabled, onTap, scale, tileIndex]);

  // Background + scale + opacity animate on UI thread — no React re-render needed
  const bgAnimStyle = useAnimatedStyle(() => {
    const fb = feedbackValues.value[tileIndex] ?? 'idle';
    return {
      transform: [{ scale: scale.value }],
      opacity: fb === 'hidden' ? 0 : 1,
      backgroundColor:
        fb === 'correct' ? successColor
        : fb === 'wrong' ? errorColor
        : surfaceColor,
    };
  });

  // Glow border — only visible when scanner is active
  const glowBorderStyle = useAnimatedStyle(() => {
    const fb = feedbackValues.value[tileIndex] ?? 'idle';
    return {
      borderWidth: fb === 'glow' ? 2 : 0,
      borderColor: fb === 'glow' ? glowColor : 'transparent',
      shadowOpacity: fb === 'glow' ? 0.6 : 0,
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
        glowBorderStyle,
        {
          width: size,
          height: size,
          borderRadius: Spacing.tileRadius,
          shadowColor: '#FFFFFF',
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: 8,
          elevation: 0,
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
