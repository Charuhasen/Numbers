import { ChallengeBanner } from '@/components/game/challenge-banner';
import { GamePotionTray } from '@/components/game/game-potion-tray';
import { GameTopBar } from '@/components/game/game-top-bar';
import { GameGrid } from '@/components/game/grid';
import { TileFeedback } from '@/components/game/grid-tile';
import { StatsBar } from '@/components/game/stats-bar';
import { TimerBar } from '@/components/game/timer-bar';
import { getAutoUseMode } from '@/constants/potions';
import { Colors, Spacing } from '@/constants/theme';
import { useProfile } from '@/context/profile-ctx';
import { GameMode } from '@/engine/types';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useGameEngine } from '@/hooks/use-game-engine';
import { setGameSessionData } from '@/lib/game-session-store';
import { startGameSession } from '@/lib/score-service';
import { getStoreItems, StoreItem } from '@/lib/store-service';
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

  const { state, tapCell, timerProgress, timerDuration, globalTimeRemaining, gameStartTime, isReady, getTimeRemaining, resumeTimer, freezeTimer, timerFrozen, freezeTimeRemaining, activateSecondChance } = useGameEngine(gameMode, handleRevealCorrect, handleTimeout);
  const { bestScores, refreshProfile, potionSlots, inventory } = useProfile();

  // Track how many copies of each potion have been consumed this session (for tray badge)
  const [potionUsedCounts, setPotionUsedCounts] = useState<Record<string, number>>({});

  // Store items — needed to read auto_use_mode from DB metadata
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  useEffect(() => {
    getStoreItems().then(setStoreItems).catch(() => {});
  }, []);

  // Session token: requested once from the server when the game screen is ready.
  // Null if the player is offline — the score will still submit but without timing validation.
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    startGameSession(gameMode).then((id) => {
      sessionIdRef.current = id;
    });
  }, [isReady, gameMode]);

  // ─── Helper: resolve slot SKU → inventory column name ────────────────
  const getSlotColumn = useCallback((slot: { potion_type: string | null }) => {
    if (!slot.potion_type) return null;
    const item = storeItems.find((i) => i.sku === slot.potion_type);
    return (item?.metadata?.column as string) ?? null;
  }, [storeItems]);

  // ─── Auto-consume potions at game start (DB-driven) ──────────────────
  // Skips Second Chance (consume-on-use) and Time Freeze (timer-threshold trigger).
  const autoConsumedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isReady || !inventory || storeItems.length === 0) return;
    for (const slot of potionSlots) {
      const col = getSlotColumn(slot);
      if (!col || autoConsumedRef.current.has(col)) continue;
      // Second Chance: handled via activate-at-start + consume-on-use below
      if (col === 'potion_second_chance') continue;
      // Time Freeze: handled via timer-threshold watcher below
      if (col === 'potion_time_freeze') continue;

      const autoMode = getAutoUseMode(col, storeItems);
      if (autoMode === 'manual') continue;
      if (autoMode === 'toggleable' && !slot.auto_use_enabled) continue;

      const count = inventory[col as keyof typeof inventory] ?? 0;
      if (count <= 0) continue;

      autoConsumedRef.current.add(col);
      supabase.rpc('consume_potion', { p_potion_column: col }).then(({ error }) => {
        if (!error) refreshProfile();
      });
    }
  }, [isReady, potionSlots, inventory, storeItems, getSlotColumn, refreshProfile]);

  // ─── Second Chance: activate at start with stacking, consume on each use ──
  // Arms the engine with count = min(slot.quantity, inventory). Each decrement
  // fires one consume_potion RPC.
  const secondChanceArmedRef = useRef(false);
  const secondChanceTotalRef = useRef(0); // how many copies were armed
  useEffect(() => {
    if (!isReady || secondChanceArmedRef.current || storeItems.length === 0) return;
    const slot = potionSlots.find((s) => getSlotColumn(s) === 'potion_second_chance');
    if (!slot) return;
    const owned = inventory?.potion_second_chance ?? 0;
    if (owned <= 0) return;
    const qty = Math.min(slot.quantity, owned);
    secondChanceArmedRef.current = true;
    secondChanceTotalRef.current = qty;
    activateSecondChance(qty);
  }, [isReady, potionSlots, inventory, storeItems, getSlotColumn, activateSecondChance]);

  // Track previous secondChanceCount to detect each decrement → fire 1 consume RPC
  const prevSecondChanceCountRef = useRef(state.secondChanceCount);
  useEffect(() => {
    const prev = prevSecondChanceCountRef.current;
    const cur = state.secondChanceCount;
    if (prev > cur) {
      // Consumed (prev - cur) copies — typically 1 at a time
      const consumed = prev - cur;
      for (let i = 0; i < consumed; i++) {
        supabase.rpc('consume_potion', { p_potion_column: 'potion_second_chance' }).then(({ error }) => {
          if (!error) refreshProfile();
        });
      }
      setPotionUsedCounts((prev) => ({
        ...prev,
        potion_second_chance: (prev.potion_second_chance ?? 0) + consumed,
      }));
    }
    prevSecondChanceCountRef.current = cur;
  }, [state.secondChanceCount, refreshProfile]);

  // ─── Time Freeze: auto-use at 1 second remaining (Blitz only) ──────
  // Counter-based: supports up to slot.quantity copies. Each freeze trigger
  // decrements the counter and consumes one copy via RPC. After freeze expires,
  // the guard resets so the polling interval can fire again when timer hits 1s.
  const timeFreezeRemainingRef = useRef(0); // copies left to auto-trigger
  const timeFreezeActiveRef = useRef(false); // true while a freeze is in progress
  const timeFreezeInitializedRef = useRef(false); // ensures one-time init
  const timeFreezeEquippedRef = useRef(false);

  // Initialize counter ONCE at game start — never re-run on inventory changes
  useEffect(() => {
    if (timeFreezeInitializedRef.current) return;
    if (storeItems.length === 0 || !inventory) return;
    timeFreezeInitializedRef.current = true;

    const slot = potionSlots.find((s) => getSlotColumn(s) === 'potion_time_freeze');
    const autoEnabled = slot ? (
      getAutoUseMode('potion_time_freeze', storeItems) === 'always' ||
      (getAutoUseMode('potion_time_freeze', storeItems) === 'toggleable' && slot.auto_use_enabled)
    ) : false;
    timeFreezeEquippedRef.current = autoEnabled;

    if (slot && autoEnabled) {
      const owned = inventory.potion_time_freeze ?? 0;
      timeFreezeRemainingRef.current = Math.min(slot.quantity, owned);
    }
  }, [potionSlots, inventory, storeItems, getSlotColumn]);

  // Poll global timer every 100ms in Blitz — trigger Time Freeze at ≤1 second
  useEffect(() => {
    if (gameMode !== 'blitz' || !isReady) return;
    const interval = setInterval(() => {
      // Don't trigger while a freeze is active or no copies remain
      if (timeFreezeActiveRef.current) return;
      if (timeFreezeRemainingRef.current <= 0) return;
      if (!timeFreezeEquippedRef.current) return;
      const remaining = getTimeRemaining();
      if (remaining <= 1 && remaining > 0) {
        timeFreezeActiveRef.current = true;
        timeFreezeRemainingRef.current -= 1;
        // Fire RPC, then activate freeze. Don't let RPC failure block the freeze.
        freezeTimer();
        setPotionUsedCounts((prev) => ({
          ...prev,
          potion_time_freeze: (prev.potion_time_freeze ?? 0) + 1,
        }));
        supabase.rpc('consume_potion', { p_potion_column: 'potion_time_freeze' }).then(({ error }) => {
          if (!error) refreshProfile();
        });
      }
    }, 100);
    return () => clearInterval(interval);
  }, [gameMode, isReady, getTimeRemaining, freezeTimer, refreshProfile]);

  // Reset the active guard when freeze expires (timerFrozen goes 1→0)
  const prevTimerFrozenRef = useRef(0);
  useEffect(() => {
    // Check on an interval since timerFrozen is a SharedValue
    const checkInterval = setInterval(() => {
      const cur = timerFrozen.value;
      if (prevTimerFrozenRef.current === 1 && cur === 0) {
        timeFreezeActiveRef.current = false;
      }
      prevTimerFrozenRef.current = cur;
    }, 200);
    return () => clearInterval(checkInterval);
  }, [timerFrozen]);

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

    if (isCorrect) {
      setInputDisabled(true);
    } else if (state.secondChanceCount > 0) {
      // Second Chance absorbs — show wrong feedback briefly, don't lock input
      const next = feedbackValues.value.slice() as TileFeedback[];
      next[index] = 'wrong';
      feedbackValues.value = next;
      // Clear the wrong feedback after a brief flash
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

      // Track usage for tray badge
      setPotionUsedCounts((prev) => ({
        ...prev,
        [potionColumn]: (prev[potionColumn] ?? 0) + 1,
      }));

      // Apply effect
      if (potionColumn === 'potion_second_chance') {
        activateSecondChance(1);
      } else if (potionColumn === 'potion_grid_skip') {
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
  }, [state, tapCell, freezeTimer, activateSecondChance, refreshProfile]);

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
          <TimerBar progress={globalTimeRemaining} durationSec={30} isGlobal frozen={timerFrozen} freezeTimeRemaining={freezeTimeRemaining} />
        ) : (
          <TimerBar progress={timerProgress} durationSec={timerDuration} frozen={timerFrozen} freezeTimeRemaining={freezeTimeRemaining} />
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

      {/* Potion Tray */}
      <GamePotionTray
        onUsePotion={handleUsePotion}
        disabled={inputDisabled || state.phase === 'gameOver' || showBanner}
        secondChanceActive={state.secondChanceCount > 0}
        potionUsedCounts={potionUsedCounts}
      />

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
