import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { HeartsDisplay } from './hearts-display';

interface GameTopBarProps {
  challengeIndex: number;
  gridIndex: number;
  hearts: number;
  showHearts: boolean;
  onExit: () => void;
}

export const GameTopBar = React.memo(function GameTopBar({
  challengeIndex,
  gridIndex,
  hearts,
  showHearts,
  onExit,
}: GameTopBarProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const handleExit = () => {
    Alert.alert(
      'Quit Game',
      'Are you sure you want to quit? Your progress will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Quit', style: 'destructive', onPress: onExit },
      ],
    );
  };

  return (
    <View style={styles.container}>
      {/* Left: Exit */}
      <TouchableOpacity onPress={handleExit} hitSlop={12} style={styles.exitButton}>
        <MaterialIcons name="close" size={24} color={theme.onSurfaceVariant} />
      </TouchableOpacity>

      {/* Center: Challenge label + grid dots */}
      <View style={styles.center}>
        <Text style={[styles.challengeLabel, { color: theme.onSurfaceVariant }]}>
          CHALLENGE {challengeIndex + 1}
        </Text>
        <View style={styles.dots}>
          {Array.from({ length: 5 }, (_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    i < gridIndex
                      ? theme.primary
                      : i === gridIndex
                        ? theme.primary
                        : theme.surfaceDim,
                  opacity: i < gridIndex ? 0.5 : 1,
                },
              ]}
            />
          ))}
        </View>
      </View>

      {/* Right: Hearts */}
      <View style={styles.right}>
        {showHearts && <HeartsDisplay current={hearts} />}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  exitButton: {
    width: 40,
    alignItems: 'flex-start',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  challengeLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  right: {
    width: 80,
    alignItems: 'flex-end',
  },
});
