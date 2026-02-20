import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
    Easing,
    cancelAnimation,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

interface PlayerInfoRowProps {
  username: string;
  bits: number;
  avatarUrl?: string;
  onSettingsPress?: () => void;
}

export function PlayerInfoRow({
  username,
  bits,
  avatarUrl,
  onSettingsPress,
}: PlayerInfoRowProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [containerWidth, setContainerWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const translateX = useSharedValue(0);

  const overflowAmount = textWidth - containerWidth;
  const isOverflowing = overflowAmount > 0;

  const startMarquee = useCallback(() => {
    if (overflowAmount <= 0) return;
    cancelAnimation(translateX);
    const duration = Math.max(overflowAmount * 30, 1500);
    translateX.value = 0;
    translateX.value = withDelay(
      1000,
      withRepeat(
        withSequence(
          withTiming(-overflowAmount, { duration, easing: Easing.linear }),
          withDelay(1200, withTiming(0, { duration: 0 })),
          withDelay(1000, withTiming(0, { duration: 0 })),
        ),
        -1,
      ),
    );
  }, [overflowAmount, translateX]);

  React.useEffect(() => {
    if (isOverflowing) {
      startMarquee();
    } else {
      cancelAnimation(translateX);
      translateX.value = 0;
    }
  }, [isOverflowing, startMarquee, translateX]);

  const marqueeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        {/* Avatar: outer for border+shadow, inner for clip */}
        <View style={[styles.avatarOuter, { borderColor: '#FFFFFF', shadowColor: '#000' }]}>
          <View style={styles.avatarInner}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: theme.primary }]}>
                <Text style={styles.avatarText}>{username.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>
        </View>

        <View
          style={styles.greetingContainer}
          onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        >
          <Text style={[styles.welcomeText, { color: theme.primary }]}>WELCOME BACK</Text>
          <View style={styles.usernameClip}>
            <Animated.Text
              style={[styles.username, { color: theme.onSurface }, marqueeStyle]}
              numberOfLines={1}
              onTextLayout={(e) => {
                const measured = e.nativeEvent.lines[0]?.width ?? 0;
                if (Math.round(measured) !== Math.round(textWidth)) {
                  setTextWidth(measured);
                }
              }}
            >
              Hi, {username}
            </Animated.Text>
          </View>
        </View>
      </View>

      <View style={styles.rightSection}>
        <View style={[styles.bitsBadge, { backgroundColor: theme.surfaceVariant, borderColor: `${theme.primary}0D` }]}>
          <MaterialIcons name="paid" size={16} color="#D4A017" />
          <Text style={[styles.bitsText, { color: theme.primary }]}>{bits.toLocaleString()}</Text>
        </View>

        <TouchableOpacity
          onPress={onSettingsPress}
          style={[styles.settingsButton, { backgroundColor: theme.surfaceVariant }]}
          activeOpacity={0.7}
        >
          <MaterialIcons name="settings" size={20} color={theme.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    marginBottom: 8,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 12,
  },
  avatarOuter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 22,
  },
  greetingContainer: {
    justifyContent: 'center',
    flex: 1,
  },
  welcomeText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    opacity: 0.8,
  },
  usernameClip: {
    overflow: 'hidden',
  },
  username: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bitsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    gap: 8,
  },
  bitsText: {
    fontSize: 14,
    fontWeight: '700',
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
