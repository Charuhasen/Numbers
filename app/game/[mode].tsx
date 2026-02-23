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
import { useGamePotions } from '@/hooks/use-game-potions';
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
  const [potionToast, setPotionToast] = useState<string | null>(null);
  const potionToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTimeout = useCallback(() => {
    setShowTimeUp(true);
  }, []);

  // feedbackValues: SharedValue array — updates go directly to UI thread, no root re-render
  const feedbackValues = useSharedValue<TileFeedback[]>(Array(9).fill('idle'));

  const handleRevealCorrect = useCallback((correctIndices: number[]) => {
    setInputDisabled(true);
    const next = feedbackValues.value.slice() as TileFeedback[];
    for (const idx of correctIndices) next[idx] = 'correct';
    feedbackValues.value = next;
  }, [feedbackValues]);

  const { state, tapCell, timerProgress, timerDuration, globalTimeRemaining, gameStartTime, isReady, getTimeRemaining, resumeTimer, freezeTimer, timerFrozen, freezeTimeRemaining, activateSecondChance } = useGameEngine(gameMode, handleRevealCorrect, handleTimeout);
  const { bestScores, refreshProfile } = useProfile();

  // ─── Potions: single source of truth ─────────────────────────────────────
  const potions = useGamePotions();

  // Track which potion effects are currently active (blocks re-use from tray)
  const [activeEffects, setActiveEffects] = useState<Set<string>>(new Set());
  const markEffectActive = useCallback((col: string) => {
    setActiveEffects((prev) => new Set(prev).add(col));
  }, []);
  const markEffectInactive = useCallback((col: string) => {
    setActiveEffects((prev) => {
      const next = new Set(prev);
      next.delete(col);
      return next;
    });
  }, []);

  // Session token
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isReady) return;
    startGameSession(gameMode).then((id) => {
      sessionIdRef.current = id;
    });
  }, [isReady, gameMode]);

  // ─── Auto-consume at game start (non-SC, non-TF potions) ────────────────
  const autoConsumedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isReady || !potions.ready) return;
    for (const slot of potions.slots) {
      if (autoConsumedRef.current.has(slot.potionColumn)) continue;
      // Second Chance: consume-on-use (below)
      if (slot.potionColumn === 'potion_second_chance') continue;
      // Time Freeze: timer-threshold trigger (below)
      if (slot.potionColumn === 'potion_time_freeze') continue;

      const isAuto = slot.autoUseMode === 'always' ||
        (slot.autoUseMode === 'toggleable' && slot.autoUseEnabled);
      if (!isAuto) continue;

      autoConsumedRef.current.add(slot.potionColumn);
      potions.consumeOne(slot.potionColumn);
    }
  }, [isReady, potions]);

  // ─── Second Chance: arm at start, consume on each absorption ─────────────
  const secondChanceArmedRef = useRef(false);
  useEffect(() => {
    if (!isReady || !potions.ready || secondChanceArmedRef.current) return;
    const slot = potions.getSlot('potion_second_chance');
    if (!slot || slot.initialQty <= 0) return;
    secondChanceArmedRef.current = true;
    activateSecondChance(slot.initialQty);
  }, [isReady, potions, activateSecondChance]);

  // Detect each secondChanceCount decrement → consume one copy
  const prevSecondChanceCountRef = useRef(state.secondChanceCount);
  useEffect(() => {
    const prev = prevSecondChanceCountRef.current;
    const cur = state.secondChanceCount;
    if (prev > cur) {
      const consumed = prev - cur;
      for (let i = 0; i < consumed; i++) {
        potions.consumeOne('potion_second_chance');
      }
    }
    prevSecondChanceCountRef.current = cur;
  }, [state.secondChanceCount, potions]);

  // ─── Time Freeze: auto-use at ≤1s remaining (Blitz) ─────────────────────
  const timeFreezeActiveRef = useRef(false); // true while freeze is in progress
  const timeFreezeInitRef = useRef(false);
  const timeFreezeEquippedRef = useRef(false);
  const timeFreezeRemainingRef = useRef(0);

  // Init once
  useEffect(() => {
    if (timeFreezeInitRef.current || !potions.ready) return;
    timeFreezeInitRef.current = true;
    const slot = potions.getSlot('potion_time_freeze');
    if (!slot) return;
    const isAuto = slot.autoUseMode === 'always' ||
      (slot.autoUseMode === 'toggleable' && slot.autoUseEnabled);
    timeFreezeEquippedRef.current = isAuto;
    timeFreezeRemainingRef.current = isAuto ? slot.initialQty : 0;
  }, [potions]);

  // Poll global timer every 100ms
  useEffect(() => {
    if (gameMode !== 'blitz' || !isReady) return;
    const interval = setInterval(() => {
      if (timeFreezeActiveRef.current) return;
      if (timeFreezeRemainingRef.current <= 0) return;
      if (!timeFreezeEquippedRef.current) return;
      const remaining = getTimeRemaining();
      if (remaining <= 1 && remaining > 0) {
        timeFreezeActiveRef.current = true;
        timeFreezeRemainingRef.current -= 1;
        markEffectActive('potion_time_freeze');
        freezeTimer();
        potions.consumeOne('potion_time_freeze');
      }
    }, 100);
    return () => clearInterval(interval);
  }, [gameMode, isReady, getTimeRemaining, freezeTimer, potions]);

  // Reset guard when freeze expires (timerFrozen shared value 1→0)
  const prevTimerFrozenRef = useRef(0);
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const cur = timerFrozen.value;
      if (prevTimerFrozenRef.current === 1 && cur === 0) {
        timeFreezeActiveRef.current = false;
        markEffectInactive('potion_time_freeze');
      }
      prevTimerFrozenRef.current = cur;
    }, 200);
    return () => clearInterval(checkInterval);
  }, [timerFrozen, markEffectInactive]);

  // ─── UI state ────────────────────────────────────────────────────────────
  const heartShake = useSharedValue(0);
  const [inputDisabled, setInputDisabled] = useState(false);
  const prevGridRef = useRef(state.currentGrid);

  // Challenge banner state
  const [showBanner, setShowBanner] = useState(true);
  const prevChallengeIndexRef = useRef(state.challengeIndex);

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

  // Navigate to game over
  useEffect(() => {
    if (state.phase === 'gameOver') {
      const timeout = setTimeout(async () => {
        const elapsedSeconds = Math.floor((Date.now() - gameStartTime) / 1000);
        await setGameSessionData({
          mode: gameMode,
          score: state.score,
          bitsEarned: state.bitsEarned,
          challengeIndex: state.challengeIndex,
          elapsedSeconds,
          events: state.events,
          sessionId: sessionIdRef.current,
        });
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

  // ─── Tap handler ─────────────────────────────────────────────────────────
  const handleTapImpl = useCallback((index: number) => {
    if (inputDisabled) return;

    const isCorrect = state.currentGrid.correctAnswers.includes(index);

    if (isCorrect) {
      setInputDisabled(true);
    } else if (state.secondChanceCount > 0) {
      const next = feedbackValues.value.slice() as TileFeedback[];
      next[index] = 'wrong';
      feedbackValues.value = next;
      setTimeout(() => {
        const reset = feedbackValues.value.slice() as TileFeedback[];
        reset[index] = 'idle';
        feedbackValues.value = reset;
      }, 300);
      tapCell(index);
      return;
    } else {
      setInputDisabled(true);
    }

    const next = feedbackValues.value.slice() as TileFeedback[];
    next[index] = isCorrect ? 'correct' : 'wrong';
    feedbackValues.value = next;

    if (!isCorrect) {
      triggerHeartShake(heartShake);
    }

    tapCell(index);
  }, [state.currentGrid, state.secondChanceCount, tapCell, inputDisabled, heartShake, feedbackValues]);

  const handleTapRef = useRef(handleTapImpl);
  handleTapRef.current = handleTapImpl;

  const stableHandleTap = useCallback((index: number) => {
    handleTapRef.current(index);
  }, []);

  const handleExit = useCallback(() => {
    router.replace('/');
  }, [router]);

  // ─── Manual potion use (tray tap) ───────────────────────────────────────
  const handleUsePotion = useCallback(async (potionColumn: string) => {
    if (state.phase === 'gameOver') return;
    // Block if this potion's effect is still active
    if (activeEffects.has(potionColumn)) {
      if (potionToastTimer.current) clearTimeout(potionToastTimer.current);
      setPotionToast('Potion already in use!');
      potionToastTimer.current = setTimeout(() => setPotionToast(null), 1000);
      return;
    }

    const consumed = potions.consumeOne(potionColumn);
    if (!consumed) return;

    if (potionColumn === 'potion_second_chance') {
      activateSecondChance(1);
    } else if (potionColumn === 'potion_grid_skip') {
      const firstCorrect = state.currentGrid.correctAnswers[0];
      if (firstCorrect !== undefined) {
        tapCell(firstCorrect);
      }
    } else if (potionColumn === 'potion_time_freeze') {
      markEffectActive('potion_time_freeze');
      freezeTimer();
    } else {
      Alert.alert('Potion Used', 'Potion consumed! (Active effect coming soon)');
    }
  }, [state, potions, activeEffects, tapCell, freezeTimer, activateSecondChance, markEffectActive]);

  if (!isReady) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
      <GameTopBar
        challengeIndex={state.challengeIndex}
        gridIndex={state.gridIndex}
        hearts={state.hearts}
        showHearts={gameMode !== 'blitz'}
        onExit={handleExit}
        heartShake={heartShake}
      />

      <View style={styles.instructionContainer}>
        <Text style={[styles.instruction, { color: theme.onSurface }]}>
          {state.currentInstruction}
        </Text>
        <View style={styles.potionToastSlot}>
          {potionToast && (
            <Animated.Text
              entering={FadeIn.duration(100)}
              exiting={FadeOut.duration(100)}
              style={[styles.potionToastText, { color: theme.error }]}
            >
              {potionToast}
            </Animated.Text>
          )}
        </View>
      </View>

      <View style={styles.timerContainer}>
        {gameMode === 'blitz' && globalTimeRemaining ? (
          <TimerBar progress={globalTimeRemaining} durationSec={30} isGlobal frozen={timerFrozen} freezeTimeRemaining={freezeTimeRemaining} />
        ) : (
          <TimerBar progress={timerProgress} durationSec={timerDuration} frozen={timerFrozen} freezeTimeRemaining={freezeTimeRemaining} />
        )}
      </View>

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

      <View style={styles.statsContainer}>
        <StatsBar
          score={state.score}
          bestScore={bestScores[gameMode] ?? 0}
          gameStartTime={gameStartTime}
        />
      </View>

      <GamePotionTray
        slots={potions.slots}
        onUsePotion={handleUsePotion}
        disabled={state.phase === 'gameOver' || showBanner}
        secondChanceActive={state.secondChanceCount > 0}
      />

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
  potionToastSlot: {
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  potionToastText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
