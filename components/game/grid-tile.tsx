import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import * as Haptics from 'expo-haptics';
import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export type TileFeedback = 'idle' | 'correct' | 'wrong';

interface GridTileProps {
  number: number;
  feedback: TileFeedback;
  isSelected: boolean;
  onPress: () => void;
  disabled: boolean;
  size: number;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export const GridTile = React.memo(function GridTile({
  number,
  feedback,
  isSelected,
  onPress,
  disabled,
  size,
}: GridTileProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const scale = useSharedValue(1);

  const handlePress = useCallback(() => {
    if (disabled) return;
    scale.value = withSequence(
      withTiming(0.92, { duration: 50 }),
      withSpring(1, { damping: 15, stiffness: 300 }),
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [disabled, onPress, scale]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const getBgColor = () => {
    if (feedback === 'correct') return theme.success;
    if (feedback === 'wrong') return theme.error;
    if (isSelected) return theme.primaryContainer;
    return theme.surfaceVariant;
  };

  const getTextColor = () => {
    if (feedback === 'correct' || feedback === 'wrong') return '#FFFFFF';
    if (isSelected) return theme.onPrimary;
    return theme.onSurface;
  };

  return (
    <AnimatedTouchable
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[
        styles.tile,
        animatedStyle,
        {
          width: size,
          height: size,
          backgroundColor: getBgColor(),
          borderRadius: Spacing.tileRadius,
        },
      ]}
    >
      <Text
        style={[
          styles.number,
          { color: getTextColor() },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {number}
      </Text>
    </AnimatedTouchable>
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
