import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInUp,
  SlideOutUp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

interface ChallengeBannerProps {
  challengeNumber: number;
  instruction: string;
  onDismiss: () => void;
}

const DISPLAY_DURATION = 1800;

export function ChallengeBanner({
  challengeNumber,
  instruction,
  onDismiss,
}: ChallengeBannerProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const progressWidth = useSharedValue(100);

  useEffect(() => {
    progressWidth.value = withTiming(0, { duration: DISPLAY_DURATION });
    const timeout = setTimeout(onDismiss, DISPLAY_DURATION);
    return () => clearTimeout(timeout);
  }, [onDismiss, progressWidth]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%` as `${number}%`,
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.overlay}
    >
      <Animated.View
        entering={SlideInUp.duration(300).springify().damping(18)}
        exiting={SlideOutUp.duration(200)}
        style={[styles.card, { backgroundColor: theme.surfaceVariant }]}
      >
        <Text style={[styles.label, { color: theme.primary }]}>
          CHALLENGE {challengeNumber}
        </Text>
        <Text style={[styles.instruction, { color: theme.onSurface }]}>
          {instruction}
        </Text>
        <View style={[styles.progressTrack, { backgroundColor: theme.surfaceDim }]}>
          <Animated.View
            style={[styles.progressFill, progressStyle, { backgroundColor: theme.primary }]}
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 100,
  },
  card: {
    paddingVertical: 28,
    paddingHorizontal: 36,
    borderRadius: 20,
    alignItems: 'center',
    gap: 12,
    minWidth: 260,
    overflow: 'hidden',
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.5,
  },
  instruction: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
});
