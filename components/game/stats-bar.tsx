import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface StatsBarProps {
  score: number;
  bestScore: number;
  elapsedSeconds: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatScore(score: number): string {
  return score.toLocaleString();
}

export const StatsBar = React.memo(function StatsBar({
  score,
  bestScore,
  elapsedSeconds,
}: StatsBarProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  return (
    <View style={[styles.container, { borderTopColor: theme.outlineVariant }]}>
      <View style={styles.stat}>
        <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>SCORE</Text>
        <Text style={[styles.value, { color: theme.onSurface }]}>{formatScore(score)}</Text>
      </View>
      <View style={[styles.divider, { backgroundColor: theme.outlineVariant }]} />
      <View style={styles.stat}>
        <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>BEST</Text>
        <Text style={[styles.value, { color: theme.onSurface }]}>{formatScore(bestScore)}</Text>
      </View>
      <View style={[styles.divider, { backgroundColor: theme.outlineVariant }]} />
      <View style={styles.stat}>
        <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>TIME</Text>
        <Text style={[styles.value, { color: theme.onSurface }]}>{formatTime(elapsedSeconds)}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    marginHorizontal: 24,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  value: {
    fontSize: 20,
    fontWeight: '700',
  },
  divider: {
    width: 1,
    height: 32,
  },
});
