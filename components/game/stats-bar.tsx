import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface StatsBarProps {
  score: number;
  bestScore: number;
  /** Stable Unix timestamp (ms) from when the game started — never changes, so never triggers GameScreen re-renders */
  gameStartTime: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatScore(score: number): string {
  return score.toLocaleString();
}

/** Self-contained elapsed timer — re-renders only this leaf component, not GameScreen */
function ElapsedTimer({ startTime }: { startTime: number }) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - startTime) / 1000));

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <View style={styles.stat}>
      <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>TIME</Text>
      <Text style={[styles.value, { color: theme.onSurface }]}>{formatTime(elapsed)}</Text>
    </View>
  );
}

export const StatsBar = React.memo(function StatsBar({
  score,
  bestScore,
  gameStartTime,
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
      <ElapsedTimer startTime={gameStartTime} />
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
