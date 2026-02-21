import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export const MODE_CARD_WIDTH = 268;

interface ModeCardProps {
  title: string;
  description: string;
  bestScore?: number;
  onPlayPress?: () => void;
  iconName: keyof typeof MaterialIcons.glyphMap;
  iconColor: string;
  iconBgColor: string;
  comingSoon?: boolean;
}

export function ModeCard({
  title,
  description,
  bestScore,
  onPlayPress,
  iconName,
  iconColor,
  iconBgColor,
  comingSoon,
}: ModeCardProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const isDark = colorScheme === 'dark';
  const buttonBg = isDark ? '#E8E4E0' : '#1E2530';
  const buttonTextColor = isDark ? '#1E2530' : '#FFFFFF';

  return (
    <View style={[styles.card, { backgroundColor: theme.surfaceVariant }]}>
      {/* Decorative bg icon — opaque color with opacity on wrapper avoids GPU overdraw */}
      <View style={[styles.decorativeIcon, styles.decorativeIconOpacity]} pointerEvents="none">
        <MaterialIcons name={iconName} size={140} color={iconColor} />
      </View>

      {/* Top row: icon container + badge */}
      <View style={styles.topRow}>
        <View style={[styles.iconContainer, { backgroundColor: iconBgColor }]}>
          <MaterialIcons name={iconName} size={28} color={iconColor} />
        </View>

        {comingSoon ? (
          <View style={[styles.badge, { backgroundColor: `${iconColor}22` }]}>
            <Text style={[styles.badgeText, { color: iconColor }]}>COMING SOON</Text>
          </View>
        ) : (
          <View style={[styles.badge, { backgroundColor: `${iconColor}22` }]}>
            <Text style={[styles.badgeText, { color: iconColor }]}>
              BEST: {bestScore ? bestScore.toLocaleString() : '--'}
            </Text>
          </View>
        )}
      </View>

      {/* Text content */}
      <View style={styles.textContent}>
        <Text style={[styles.title, { color: theme.onSurface }]}>{title}</Text>
        <Text style={[styles.description, { color: theme.onSurface }]}>{description}</Text>
      </View>

      {/* Button */}
      {comingSoon ? (
        <View style={[styles.button, { backgroundColor: theme.surfaceDim ?? theme.surfaceVariant }]}>
          <Text style={[styles.buttonText, { color: theme.onSurfaceVariant, opacity: 0.5 }]}>COMING SOON</Text>
        </View>
      ) : (
        <TouchableOpacity
          onPress={onPlayPress}
          style={[styles.button, { backgroundColor: buttonBg }]}
          activeOpacity={0.85}
        >
          <Text style={[styles.buttonText, { color: buttonTextColor }]}>PLAY</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: MODE_CARD_WIDTH,
    borderRadius: 28,
    padding: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  decorativeIcon: {
    position: 'absolute',
    top: -20,
    right: -20,
    zIndex: 0,
  },
  decorativeIconOpacity: {
    opacity: 0.08,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    zIndex: 1,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  textContent: {
    flex: 1,
    marginBottom: 20,
    zIndex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 6,
  },
  description: {
    fontSize: 13,
    opacity: 0.7,
    lineHeight: 18,
  },
  button: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
