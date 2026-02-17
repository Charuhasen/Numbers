import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  SharedValue,
  ZoomOut,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface HeartsDisplayProps {
  current: number;
  max?: number;
  shake?: SharedValue<number>;
}

export const HeartsDisplay = React.memo(function HeartsDisplay({
  current,
  max = 3,
  shake,
}: HeartsDisplayProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  // Internal shake value if no external one provided
  const internalShake = useSharedValue(0);
  const shakeValue = shake ?? internalShake;

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeValue.value }],
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {Array.from({ length: max }, (_, i) => {
        const filled = i < current;
        return (
          <Animated.View
            key={i}
            exiting={filled ? undefined : ZoomOut.duration(200).withCallback(() => {})}
          >
            <MaterialIcons
              name={filled ? 'favorite' : 'favorite-border'}
              size={22}
              color={filled ? theme.heart : theme.heartEmpty}
            />
          </Animated.View>
        );
      })}
    </Animated.View>
  );
});

/** Trigger a short horizontal shake on the given shared value. */
export function triggerHeartShake(shakeValue: SharedValue<number>) {
  'worklet';
  shakeValue.value = withSequence(
    withTiming(-4, { duration: 50 }),
    withTiming(4, { duration: 50 }),
    withTiming(-3, { duration: 50 }),
    withTiming(3, { duration: 50 }),
    withTiming(0, { duration: 50 }),
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
});
