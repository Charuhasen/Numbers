import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  ZoomOut,
} from 'react-native-reanimated';

interface HeartsDisplayProps {
  current: number;
  max?: number;
}

export const HeartsDisplay = React.memo(function HeartsDisplay({
  current,
  max = 3,
}: HeartsDisplayProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  return (
    <View style={styles.container}>
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
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
});
