import { ChallengeBanner } from '@/components/game/challenge-banner';
import { GameTopBar } from '@/components/game/game-top-bar';
import { GameGrid } from '@/components/game/grid';
import { TileFeedback } from '@/components/game/grid-tile';
import { StatsBar } from '@/components/game/stats-bar';
import { TimerBar } from '@/components/game/timer-bar';
import { Colors, Spacing } from '@/constants/theme';
import { useProfile } from '@/context/profile-ctx';
import { GameMode } from '@/engine/types';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useGameEngine } from '@/hooks/use-game-engine';
import { setGameSessionData } from '@/lib/game-session-store';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { triggerHeartShake } from '@/components/game/hearts-display';

export default function GameScreen() {
  const { mode } = useLocalSearchParams<{ mode: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const gameMode = (mode as GameMode) || 'classic';

  // Called by the engine whenever the correct answer should be revealed
  // (wrong tap or timeout). Highlights the correct tile(s) in green and
  // locks input so the player can't tap during the reveal window.
  const handleRevealCorrect = useCallback((correctIndices: number[]) => {
    setInputDisabled(true);
    setFeedbackMap((prev) => {
      const update = { ...prev };
      for (const idx of correctIndices) update[idx] = 'correct';
      return update;
    });
  }, []);

  const { state, tapCell, timerProgress, elapsedSeconds, isReady, resumeTimer } = useGameEngine(gameMode, handleRevealCorrect);
  const { bestScores } = useProfile();

  const heartShake = useSharedValue(0);
  const [feedbackMap, setFeedbackMap] = useState<Record<number, TileFeedback>>({});
  const [inputDisabled, setInputDisabled] = useState(false);
  const prevGridRef = useRef(state.currentGrid);

  // Challenge banner state
  const [showBanner, setShowBanner] = useState(true); // show for first challenge
  const prevChallengeIndexRef = useRef(state.challengeIndex);

  // Show banner when challenge index changes
  useEffect(() => {
    if (state.challengeIndex !== prevChallengeIndexRef.current) {
      setShowBanner(true);
      prevChallengeIndexRef.current = state.challengeIndex;
    }
  }, [state.challengeIndex]);

  const handleBannerDismiss = useCallback(() => {
    setShowBanner(false);
    resumeTimer();
  }, [resumeTimer]);

  // Reset feedback when grid changes
  useEffect(() => {
    if (state.currentGrid !== prevGridRef.current) {
      setFeedbackMap({});
      setInputDisabled(false);
      prevGridRef.current = state.currentGrid;
    }
  }, [state.currentGrid]);

  // Navigate to game over when phase changes
  useEffect(() => {
    if (state.phase === 'gameOver') {
      const timeout = setTimeout(async () => {
        // Persist session to AsyncStorage before navigating so it survives app kills.
        await setGameSessionData({
          mode: gameMode,
          score: state.score,
          bitsEarned: state.bitsEarned,
          challengeIndex: state.challengeIndex,
          elapsedSeconds,
          events: state.events,
        });
        router.replace({
          pathname: '/game/game-over',
          params: {
            score: state.score.toString(),
            challengeIndex: state.challengeIndex.toString(),
            bitsEarned: state.bitsEarned.toString(),
            elapsedSeconds: elapsedSeconds.toString(),
            mode: gameMode,
          },
        });
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [state.phase, state.score, state.challengeIndex, state.bitsEarned, elapsedSeconds, gameMode, router]);

  const handleTap = useCallback((index: number) => {
    if (inputDisabled) return;

    const isCorrect = state.currentGrid.correctAnswers.includes(index);
    setInputDisabled(true);
    setFeedbackMap({ [index]: isCorrect ? 'correct' : 'wrong' });

    if (!isCorrect) {
      triggerHeartShake(heartShake);
    }

    tapCell(index);
  }, [state.currentGrid, tapCell, inputDisabled, heartShake]);

  const handleExit = useCallback(() => {
    router.replace('/');
  }, [router]);

  if (!isReady) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
      {/* Top Bar: Exit, Challenge label, Hearts */}
      <GameTopBar
        challengeIndex={state.challengeIndex}
        gridIndex={state.gridIndex}
        hearts={state.hearts}
        showHearts={true}
        onExit={handleExit}
        heartShake={heartShake}
      />

      {/* Instruction */}
      <View style={styles.instructionContainer}>
        <Text style={[styles.instruction, { color: theme.onSurface }]}>
          {state.currentInstruction}
        </Text>
      </View>

      {/* Timer Bar */}
      <View style={styles.timerContainer}>
        <TimerBar progress={timerProgress} />
      </View>

      {/* Grid */}
      <View style={styles.gridContainer}>
        <GameGrid
          numbers={state.currentGrid.numbers}
          feedbackMap={feedbackMap}
          onTap={handleTap}
          disabled={inputDisabled || state.phase === 'gameOver' || showBanner}
        />
      </View>

      {/* Stats Bar */}
      <View style={styles.statsContainer}>
        <StatsBar
          score={state.score}
          bestScore={bestScores[gameMode] ?? 0}
          elapsedSeconds={elapsedSeconds}
        />
      </View>

      {/* Potion tray placeholder */}
      <View style={styles.potionTray}>
        <View style={[styles.potionSlot, { backgroundColor: theme.surfaceDim }]} />
        <View style={[styles.potionSlot, { backgroundColor: theme.surfaceDim }]} />
        <View style={[styles.potionSlot, { backgroundColor: theme.surfaceDim }]} />
      </View>

      {/* Challenge banner overlay */}
      {showBanner && (
        <ChallengeBanner
          challengeNumber={state.challengeIndex + 1}
          instruction={state.currentInstruction}
          onDismiss={handleBannerDismiss}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  instructionContainer: {
    paddingHorizontal: Spacing.screenPadding,
    paddingVertical: 16,
    alignItems: 'center',
  },
  instruction: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  timerContainer: {
    paddingHorizontal: Spacing.screenPadding,
    marginBottom: 20,
  },
  gridContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.screenPadding,
  },
  statsContainer: {
    marginTop: 'auto',
  },
  potionTray: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: Spacing.screenPadding,
  },
  potionSlot: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
});
