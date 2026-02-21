import { ChallengeBanner } from '@/components/game/challenge-banner';
import { GamePotionTray } from '@/components/game/game-potion-tray';
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
import { startGameSession } from '@/lib/score-service';
import { supabase } from '@/lib/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, InteractionManager, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { triggerHeartShake } from '@/components/game/hearts-display';

export default function GameScreen() {
  const { mode } = useLocalSearchParams<{ mode: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const gameMode = (mode as GameMode) || 'classic';

  const [showTimeUp, setShowTimeUp] = useState(false);

  // Called by the engine on timeout — freezes all tiles blue before the
  // correct answer is revealed on top (onRevealCorrect overrides the correct tile to green).
  const handleTimeout = useCallback(() => {
    setShowTimeUp(true);
  }, []);

  // feedbackValues: SharedValue array — updates go directly to UI thread, no root re-render
  const feedbackValues = useSharedValue<TileFeedback[]>(Array(9).fill('idle'));

  // Called by the engine whenever the correct answer should be revealed
  // (wrong tap or timeout). Updates the SharedValue — no React state change.
  const handleRevealCorrect = useCallback((correctIndices: number[]) => {
    setInputDisabled(true);
    const next = feedbackValues.value.slice() as TileFeedback[];
    for (const idx of correctIndices) next[idx] = 'correct';
    feedbackValues.value = next;
  }, [feedbackValues]);

  const { state, tapCell, timerProgress, timerDuration, globalTimeRemaining, gameStartTime, isReady, resumeTimer, freezeTimer, timerFrozen } = useGameEngine(gameMode, handleRevealCorrect, handleTimeout);
  const { bestScores, refreshProfile } = useProfile();

  // Session token: requested once from the server when the game screen is ready.
  // Null if the player is offline — the score will still submit but without timing validation.
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    startGameSession(gameMode).then((id) => {
      sessionIdRef.current = id;
    });
  }, [isReady, gameMode]);

  const heartShake = useSharedValue(0);
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
      feedbackValues.value = Array(9).fill('idle');
      setInputDisabled(false);
      setShowTimeUp(false);
      prevGridRef.current = state.currentGrid;
    }
  }, [state.currentGrid, feedbackValues]);

  // Navigate to game over when phase changes
  useEffect(() => {
    if (state.phase === 'gameOver') {
      const timeout = setTimeout(async () => {
        const elapsedSeconds = Math.floor((Date.now() - gameStartTime) / 1000);
        // Persist session to AsyncStorage before navigating so it survives app kills.
        await setGameSessionData({
          mode: gameMode,
          score: state.score,
          bitsEarned: state.bitsEarned,
          challengeIndex: state.challengeIndex,
          elapsedSeconds,
          events: state.events,
          sessionId: sessionIdRef.current,
        });
        // Defer navigation until after any in-progress interactions finish
        // so the game-over transition doesn't stutter while AsyncStorage serializes.
        InteractionManager.runAfterInteractions(() => {
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
        });
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [state.phase, state.score, state.challengeIndex, state.bitsEarned, gameStartTime, gameMode, router]);

  // handleTap written to a ref so the stable wrapper never invalidates GridTile memos
  const handleTapImpl = useCallback((index: number) => {
    if (inputDisabled) return;

    const isCorrect = state.currentGrid.correctAnswers.includes(index);
    setInputDisabled(true);

    const next = feedbackValues.value.slice() as TileFeedback[];
    next[index] = isCorrect ? 'correct' : 'wrong';
    feedbackValues.value = next;

    if (!isCorrect) {
      triggerHeartShake(heartShake);
    }

    tapCell(index);
  }, [state.currentGrid, tapCell, inputDisabled, heartShake, feedbackValues]);

  const handleTapRef = useRef(handleTapImpl);
  handleTapRef.current = handleTapImpl;

  // Stable tap handler — never recreates, so GameGrid/GridTile React.memo is never defeated
  const stableHandleTap = useCallback((index: number) => {
    handleTapRef.current(index);
  }, []);

  const handleExit = useCallback(() => {
    router.replace('/');
  }, [router]);

  const handleUsePotion = useCallback(async (potionColumn: string) => {
    if (state.phase === 'gameOver') return;

    try {
      const { error } = await supabase.rpc('consume_potion', { p_potion_column: potionColumn });
      if (error) throw error;

      // Apply effect
      if (potionColumn === 'potion_grid_skip') {
        const firstCorrect = state.currentGrid.correctAnswers[0];
        if (firstCorrect !== undefined) {
          tapCell(firstCorrect);
        }
      } else if (potionColumn === 'potion_time_freeze') {
        freezeTimer();
      } else {
        Alert.alert('Potion Used', 'Potion consumed! (Active effect coming soon)');
      }

      refreshProfile();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not use potion.');
    }
  }, [state, tapCell, refreshProfile]);

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
        showHearts={gameMode !== 'blitz'}
        onExit={handleExit}
        heartShake={heartShake}
      />

      {/* Instruction */}
      <View style={styles.instructionContainer}>
        <Text style={[styles.instruction, { color: theme.onSurface }]}>
          {state.currentInstruction}
        </Text>
      </View>

      {/* Timer Bar — Classic: per-grid timer, Blitz: global 60s timer */}
      <View style={styles.timerContainer}>
        {gameMode === 'blitz' && globalTimeRemaining ? (
          <TimerBar progress={globalTimeRemaining} durationSec={60} isGlobal frozen={timerFrozen} />
        ) : (
          <TimerBar progress={timerProgress} durationSec={timerDuration} frozen={timerFrozen} />
        )}
      </View>

      {/* Grid */}
      <View style={styles.gridContainer}>
        {showTimeUp && (
          <Animated.Text
            entering={FadeIn.duration(150)}
            exiting={FadeOut.duration(150)}
            style={[styles.timeUpLabel, { color: theme.error }]}
          >
            TIME UP!
          </Animated.Text>
        )}
        <GameGrid
          numbers={state.currentGrid.numbers}
          feedbackValues={feedbackValues}
          onTap={stableHandleTap}
          disabled={inputDisabled || state.phase === 'gameOver' || showBanner}
        />
      </View>

      {/* Stats Bar */}
      <View style={styles.statsContainer}>
        <StatsBar
          score={state.score}
          bestScore={bestScores[gameMode] ?? 0}
          gameStartTime={gameStartTime}
        />
      </View>

      {/* Potion Tray (Blitz only, or configured by gameMode) */}
      {gameMode === 'blitz' && (
        <GamePotionTray
          onUsePotion={handleUsePotion}
          disabled={inputDisabled || state.phase === 'gameOver' || showBanner}
        />
      )}

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
    gap: 16,
  },
  timeUpLabel: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 3,
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
