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
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, InteractionManager, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, runOnJS, useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
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

  const triggerTimeFreeze = useCallback(() => {
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
  }, [getTimeRemaining, markEffectActive, freezeTimer, potions]);

  useAnimatedReaction(
    () => globalTimeRemaining?.value ?? 0,
    (remaining, prev) => {
      if (gameMode !== 'blitz' || !isReady) return;
      if (prev === null) return;
      
      if (remaining <= 1 && remaining > 0 && prev > 1) {
        runOnJS(triggerTimeFreeze)();
      }
    },
    [gameMode, isReady, triggerTimeFreeze]
  );

  const handleFreezeExpired = useCallback(() => {
    timeFreezeActiveRef.current = false;
    markEffectInactive('potion_time_freeze');
  }, [markEffectInactive]);

  useAnimatedReaction(
    () => timerFrozen.value,
    (cur, prev) => {
      if (prev === 1 && cur === 0) {
        runOnJS(handleFreezeExpired)();
      }
    },
    [handleFreezeExpired]
  );

  // ─── UI state ────────────────────────────────────────────────────────────
  const heartShake = useSharedValue(0);
  const [inputDisabled, setInputDisabled] = useState(false);
  const prevGridRef = useRef(state.currentGrid);

  // 50/50 & Scanner & Grid Skip: track gridIndex they were used on (once per grid each).
  // Scanner and 50/50 cannot be used on the same grid.
  const fiftyFiftyUsedGridRef = useRef<number | null>(null);
  const scannerUsedGridRef = useRef<number | null>(null);
  const gridSkipUsedGridRef = useRef<number | null>(null);

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

  // ─── Helper: show potion toast ─────────────────────────────────────────
  const showPotionToast = useCallback((message: string) => {
    if (potionToastTimer.current) clearTimeout(potionToastTimer.current);
    setPotionToast(message);
    potionToastTimer.current = setTimeout(() => setPotionToast(null), 1000);
  }, []);

  // ─── Manual potion use (tray tap) ───────────────────────────────────────
  //
  // POTION RULES — each potion has independent validation.
  // Multiple DIFFERENT potions can be active simultaneously (e.g. Time Freeze + 50/50).
  // The same potion CANNOT be re-used while its effect is still active.
  //
  // ┌─────────────────────┬──────────────────────────────────────────────────────────┐
  // │ Potion              │ Rules                                                    │
  // ├─────────────────────┼──────────────────────────────────────────────────────────┤
  // │ potion_time_freeze  │ Manual tap: freezes timer for 5s. Cannot re-use while    │
  // │                     │ freeze is active. Marked active on use, inactive on      │
  // │                     │ freeze expiry. Also auto-triggers in Blitz at ≤1s.       │
  // ├─────────────────────┼──────────────────────────────────────────────────────────┤
  // │ potion_second_chance│ Passive: auto-armed at game start. Each copy absorbs 1   │
  // │                     │ wrong tap without losing a heart. Manual tap adds +1 to  │
  // │                     │ the absorption counter.                                  │
  // ├─────────────────────┼──────────────────────────────────────────────────────────┤
  // │ potion_50_50        │ Manual tap: hides 4 random wrong tiles, leaving correct  │
  // │                     │ + 4 distractors. Once per GRID — resets on grid change.  │
  // │                     │ Cannot combine with Scanner on the same grid.             │
  // ├─────────────────────┼──────────────────────────────────────────────────────────┤
  // │ potion_grid_skip    │ Manual tap: auto-solves the current grid for full score   │
  // │                     │ points. Instant effect — no active duration, so no        │
  // │                     │ re-use blocking needed. Once per GRID.                    │
  // ├─────────────────────┼──────────────────────────────────────────────────────────┤
  // │ potion_scanner      │ Manual tap: subtle glow on correct tile + 2 adjacent       │
  // │                     │ tiles in opposite directions for 1s. All 3 look the same. │
  // │                     │ Timer keeps running. Cannot combine with 50/50 same grid. │
  // ├─────────────────────┼──────────────────────────────────────────────────────────┤
  // │ potion_fortune_tonic│ Passive: doubles potion drop rates for 5 rounds.         │
  // │                     │ Auto-consumed at game start. Not manually tappable.       │
  // │                     │ (TODO: implement drop rate logic)                         │
  // ├─────────────────────┼──────────────────────────────────────────────────────────┤
  // │ potion_revive       │ Passive: auto-triggers on death, resurrects with 1 heart.│
  // │                     │ Not manually tappable.                                    │
  // │                     │ (TODO: implement revive logic)                            │
  // └─────────────────────┴──────────────────────────────────────────────────────────┘
  //
  const handleUsePotion = useCallback(async (potionColumn: string) => {
    if (state.phase === 'gameOver') return;

    // ── Per-potion validation ──────────────────────────────────────────────

    // Time Freeze: block re-use while freeze effect is still active
    if (potionColumn === 'potion_time_freeze') {
      if (activeEffects.has('potion_time_freeze')) {
        showPotionToast('Time Freeze already active!');
        return;
      }
    }

    // 50/50: once per grid, and cannot be used on a grid where Scanner was used
    if (potionColumn === 'potion_50_50') {
      if (fiftyFiftyUsedGridRef.current === state.gridIndex) {
        showPotionToast('Already used on this grid!');
        return;
      }
      if (scannerUsedGridRef.current === state.gridIndex) {
        showPotionToast('Cannot use with Scanner on same grid!');
        return;
      }
    }

    // Grid Skip: once per grid
    if (potionColumn === 'potion_grid_skip') {
      if (gridSkipUsedGridRef.current === state.gridIndex) {
        showPotionToast('Already used on this grid!');
        return;
      }
    }

    // Scanner: once per grid, block while glow is active, cannot combine with 50/50 on same grid
    if (potionColumn === 'potion_scanner') {
      if (activeEffects.has('potion_scanner')) {
        showPotionToast('Scanner already active!');
        return;
      }
      if (scannerUsedGridRef.current === state.gridIndex) {
        showPotionToast('Already used on this grid!');
        return;
      }
      if (fiftyFiftyUsedGridRef.current === state.gridIndex) {
        showPotionToast('Cannot use with 50/50 on same grid!');
        return;
      }
    }

    // ── Consume one copy from inventory ────────────────────────────────────
    const consumed = potions.consumeOne(potionColumn);
    if (!consumed) return;

    // ── Apply potion effect ────────────────────────────────────────────────

    if (potionColumn === 'potion_time_freeze') {
      // Freeze the timer for 5s. Marked active to prevent stacking.
      // Cleared automatically when freeze expires (see timerFrozen watcher).
      markEffectActive('potion_time_freeze');
      freezeTimer();

    } else if (potionColumn === 'potion_second_chance') {
      // Add +1 absorption to the counter. Each point absorbs 1 wrong tap.
      activateSecondChance(1);

    } else if (potionColumn === 'potion_50_50') {
      // Hide 4 random wrong tiles. Correct answers always remain visible.
      // Tracked per gridIndex so it resets on each new grid.
      fiftyFiftyUsedGridRef.current = state.gridIndex;
      const correctSet = new Set(state.currentGrid.correctAnswers);
      const wrongIndices = Array.from({ length: 9 }, (_, i) => i)
        .filter((i) => !correctSet.has(i));
      // Fisher-Yates shuffle, then take first 4
      for (let i = wrongIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [wrongIndices[i], wrongIndices[j]] = [wrongIndices[j], wrongIndices[i]];
      }
      const toHide = wrongIndices.slice(0, 4);
      const next = feedbackValues.value.slice() as TileFeedback[];
      for (const idx of toHide) next[idx] = 'hidden';
      feedbackValues.value = next;

    } else if (potionColumn === 'potion_grid_skip') {
      // Auto-solve: tap the correct answer instantly for full score.
      // Instant effect — no active duration, no re-use blocking needed. Once per grid.
      gridSkipUsedGridRef.current = state.gridIndex;
      const firstCorrect = state.currentGrid.correctAnswers[0];
      if (firstCorrect !== undefined) {
        tapCell(firstCorrect);
      }

    } else if (potionColumn === 'potion_scanner') {
      // Scanner: shows a subtle glow on the correct tile + 2 adjacent tiles in
      // opposite directions for 1 second. All 3 tiles look the same (glow) so
      // the player knows the answer is in this cluster but must still figure out
      // which one. Timer keeps running. Cannot combine with 50/50 on same grid.
      //
      // Grid layout (3x3):   0 1 2
      //                       3 4 5
      //                       6 7 8
      //
      // We pick a random axis (horizontal, vertical, or diagonal) and glow
      // the neighbor on each side. Edge/corner tiles may have fewer neighbors.
      scannerUsedGridRef.current = state.gridIndex;
      markEffectActive('potion_scanner');
      const correctIdx = state.currentGrid.correctAnswers[0];
      if (correctIdx !== undefined) {
        const row = Math.floor(correctIdx / 3);
        const col = correctIdx % 3;

        // Collect ALL adjacent tile indices (up to 8 neighbors on a 3x3 grid)
        const directions: [number, number][] = [
          [-1, -1], [-1, 0], [-1, 1],
          [0, -1],           [0, 1],
          [1, -1],  [1, 0],  [1, 1],
        ];
        const allNeighbors: number[] = [];
        for (const [dr, dc] of directions) {
          const nr = row + dr, nc = col + dc;
          if (nr >= 0 && nr < 3 && nc >= 0 && nc < 3) {
            allNeighbors.push(nr * 3 + nc);
          }
        }

        // Shuffle neighbors and pick 2 so we always glow exactly 3 tiles
        for (let i = allNeighbors.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [allNeighbors[i], allNeighbors[j]] = [allNeighbors[j], allNeighbors[i]];
        }
        const adjacentIndices = allNeighbors.slice(0, 2);

        // Apply uniform glow to all tiles — no distinction between correct and adjacent
        const next = feedbackValues.value.slice() as TileFeedback[];
        const glowTiles = [correctIdx, ...adjacentIndices];
        for (const idx of glowTiles) next[idx] = 'glow';
        feedbackValues.value = next;

        // Revert after 1 second
        setTimeout(() => {
          const cur = feedbackValues.value.slice() as TileFeedback[];
          for (const idx of glowTiles) {
            if (cur[idx] === 'glow') cur[idx] = 'idle';
          }
          feedbackValues.value = cur;
          markEffectInactive('potion_scanner');
        }, 1000);
      } else {
        markEffectInactive('potion_scanner');
      }

    } else {
      // Unhandled potion type — log for debugging
      console.warn(`Potion effect not implemented: ${potionColumn}`);
    }
  }, [state, potions, activeEffects, tapCell, freezeTimer, activateSecondChance, markEffectActive, markEffectInactive, showPotionToast, feedbackValues]);

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
          <TimerBar progress={globalTimeRemaining} durationSec={60} isGlobal frozen={timerFrozen} freezeTimeRemaining={freezeTimeRemaining} />
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
