import { Colors, Spacing } from '@/constants/theme';
import { useProfile } from '@/context/profile-ctx';
import { GameMode } from '@/engine/types';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { clearGameSessionData, getGameSessionData } from '@/lib/game-session-store';
import { processPendingScores, queuePendingScore, submitGameScore } from '@/lib/score-service';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type SubmissionStatus = 'submitting' | 'success' | 'error';

export default function GameOverScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const { refreshProfile } = useProfile();
  const params = useLocalSearchParams<{
    score: string;
    challengeIndex: string;
    bitsEarned: string;
    elapsedSeconds: string;
    mode: string;
  }>();

  const score = parseInt(params.score || '0', 10);
  const rounds = parseInt(params.challengeIndex || '0', 10);
  const bits = parseInt(params.bitsEarned || '0', 10);
  const elapsed = parseInt(params.elapsedSeconds || '0', 10);
  const mode = (params.mode || 'classic') as GameMode;

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>('submitting');
  const [isNewBest, setIsNewBest] = useState(false);
  const submittedRef = useRef(false);

  const doSubmit = useCallback(async () => {
    const sessionData = getGameSessionData();
    if (!sessionData) {
      setSubmissionStatus('success');
      return;
    }

    try {
      setSubmissionStatus('submitting');
      const result = await submitGameScore(sessionData.mode, sessionData.events, sessionData.challengeIndex);
      clearGameSessionData();
      setSubmissionStatus('success');

      if (result.isNewBest) {
        setIsNewBest(true);
      }

      await refreshProfile();
    } catch {
      if (sessionData) {
        await queuePendingScore({
          mode: sessionData.mode,
          events: sessionData.events,
          roundReached: sessionData.challengeIndex,
        });
        clearGameSessionData();
      }
      setSubmissionStatus('error');
    }
  }, [refreshProfile]);

  useEffect(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    doSubmit();
  }, [doSubmit]);

  const handleRetry = useCallback(async () => {
    setSubmissionStatus('submitting');
    try {
      const flushed = await processPendingScores();
      if (flushed > 0) {
        setSubmissionStatus('success');
        await refreshProfile();
      } else {
        setSubmissionStatus('error');
      }
    } catch {
      setSubmissionStatus('error');
    }
  }, [refreshProfile]);

  const handlePlayAgain = () => {
    router.replace(`/game/${mode}`);
  };

  const handleHome = () => {
    router.replace('/');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
      <View style={styles.content}>
        {/* Title */}
        <Text style={[styles.title, { color: theme.error }]}>GAME OVER</Text>

        {/* New Best indicator */}
        {isNewBest && (
          <View style={[styles.newBestBadge, { backgroundColor: theme.primary }]}>
            <MaterialIcons name="emoji-events" size={16} color={theme.onPrimary} />
            <Text style={[styles.newBestText, { color: theme.onPrimary }]}>New Best!</Text>
          </View>
        )}

        {/* Score */}
        <View style={styles.scoreSection}>
          <Text style={[styles.scoreLabel, { color: theme.onSurfaceVariant }]}>FINAL SCORE</Text>
          <Text style={[styles.scoreValue, { color: theme.onSurface }]}>
            {score.toLocaleString()}
          </Text>
        </View>

        {/* Stats Grid */}
        <View style={[styles.statsGrid, { backgroundColor: theme.surfaceVariant }]}>
          <View style={styles.statRow}>
            <View style={styles.statItem}>
              <MaterialIcons name="replay" size={20} color={theme.primary} />
              <Text style={[styles.statLabel, { color: theme.onSurfaceVariant }]}>Rounds</Text>
              <Text style={[styles.statValue, { color: theme.onSurface }]}>{rounds}</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.outlineVariant }]} />
            <View style={styles.statItem}>
              <MaterialIcons name="access-time" size={20} color={theme.primary} />
              <Text style={[styles.statLabel, { color: theme.onSurfaceVariant }]}>Time</Text>
              <Text style={[styles.statValue, { color: theme.onSurface }]}>{timeStr}</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.outlineVariant }]} />
            <View style={styles.statItem}>
              <MaterialIcons name="toll" size={20} color={theme.primary} />
              <Text style={[styles.statLabel, { color: theme.onSurfaceVariant }]}>Bits</Text>
              <Text style={[styles.statValue, { color: theme.onSurface }]}>{bits}</Text>
            </View>
          </View>
        </View>

        {/* Submission status */}
        <View style={styles.statusRow}>
          {submissionStatus === 'submitting' && (
            <>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.statusText, { color: theme.onSurfaceVariant }]}>
                Saving score...
              </Text>
            </>
          )}
          {submissionStatus === 'success' && (
            <>
              <MaterialIcons name="check-circle" size={18} color={theme.primary} />
              <Text style={[styles.statusText, { color: theme.primary }]}>Score saved</Text>
            </>
          )}
          {submissionStatus === 'error' && (
            <>
              <MaterialIcons name="cloud-off" size={18} color={theme.onSurfaceVariant} />
              <Text style={[styles.statusText, { color: theme.onSurfaceVariant }]}>
                Offline — score queued
              </Text>
              <TouchableOpacity onPress={handleRetry} hitSlop={8}>
                <MaterialIcons name="refresh" size={18} color={theme.primary} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Buttons */}
        <View style={styles.buttons}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            onPress={handlePlayAgain}
            activeOpacity={0.8}
          >
            <MaterialIcons name="replay" size={20} color={theme.onPrimary} />
            <Text style={[styles.primaryButtonText, { color: theme.onPrimary }]}>
              Play Again
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, { backgroundColor: theme.surfaceVariant }]}
            onPress={handleHome}
            activeOpacity={0.8}
          >
            <MaterialIcons name="home" size={20} color={theme.onSurface} />
            <Text style={[styles.secondaryButtonText, { color: theme.onSurface }]}>
              Home
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.screenPadding,
    gap: 32,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 4,
  },
  newBestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: -16,
  },
  newBestText: {
    fontSize: 14,
    fontWeight: '700',
  },
  scoreSection: {
    alignItems: 'center',
    gap: 8,
  },
  scoreLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: '800',
  },
  statsGrid: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  statDivider: {
    width: 1,
    height: 48,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: -16,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  buttons: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
