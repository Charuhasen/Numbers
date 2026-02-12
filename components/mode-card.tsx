import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ModeCardProps {
  title: string;
  description: string;
  bestScore: number;
  onPlayPress: () => void;
  isDaily?: boolean;
  iconName: keyof typeof MaterialIcons.glyphMap;
}

export function ModeCard({ title, description, bestScore, onPlayPress, iconName }: ModeCardProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  return (
    <View style={[styles.card, { backgroundColor: theme.surfaceVariant }]}>
      <View style={styles.contentContainer}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: theme.onSurface }]}>{title}</Text>
            <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>{description}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)' }]}>
            <Text style={[styles.badgeText, { color: theme.primary }]}>BEST: {bestScore ? bestScore.toLocaleString() : '--'}</Text>
          </View>
        </View>
        
        <TouchableOpacity 
          onPress={onPlayPress} 
          style={[styles.playButton, { backgroundColor: theme.primary }]}
          activeOpacity={0.9}
        >
          <Text style={styles.playText}>PLAY</Text>
        </TouchableOpacity>
      </View>

      {/* Decorative background icon */}
      <View style={styles.iconBackground}>
        <MaterialIcons name={iconName} size={112} color={`${theme.primary}0D`} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    marginHorizontal: 24,
    marginBottom: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  contentContainer: {
    padding: 24,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    opacity: 0.6,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  playButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  iconBackground: {
    position: 'absolute',
    right: -16,
    top: -16,
    zIndex: 1,
  },
});
