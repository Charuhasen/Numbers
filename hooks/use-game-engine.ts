import { ChallengePool, getNextChallenge, loadChallengePool } from '@/engine/challenge-pool';
import { createInitialState, getTimerDuration } from '@/engine/game-init';
import { generateGrid } from '@/engine/grid-generator';
import { gameReducer } from '@/engine/game-reducer';
import { ChallengeType, GameMode, GameState } from '@/engine/types';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';

export function useGameEngine(mode: GameMode) {
  const pool = useMemo<ChallengePool>(() => loadChallengePool(), []);
  const recentTypesRef = useRef<ChallengeType[]>([]);

  // Generate first challenge and grid
  const initialData = useMemo(() => {
    const challenge = getNextChallenge(0, mode, [], pool);
    recentTypesRef.current = [challenge.type];
    const grid = generateGrid(challenge);
    return { challenge, grid };
  }, [mode, pool]);

  const [state, dispatch] = useReducer(
    gameReducer,
    createInitialState(mode, initialData.challenge, initialData.grid),
  );

  // Timer shared value for the animated bar (1.0 → 0.0)
  const timerProgress = useSharedValue(1);
  const timerDuration = getTimerDuration(state.gridIndex);

  // Refs for timer management (avoids re-renders)
  const timerStartRef = useRef<number>(Date.now());
  const timerDurationRef = useRef<number>(timerDuration);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<GameState>(state);
  const isAdvancingRef = useRef(false);

  // Elapsed time tracking
  const gameStartRef = useRef<number>(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Keep stateRef in sync
  stateRef.current = state;

  // Track isReady
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(true);
  }, []);

  // Generate next grid (and potentially next challenge)
  const generateNextGridData = useCallback(() => {
    const s = stateRef.current;
    const nextGridIndex = s.gridIndex + 1;

    if (nextGridIndex >= 5) {
      // New challenge
      const nextChallengeIndex = s.challengeIndex + 1;
      const nextChallenge = getNextChallenge(
        nextChallengeIndex,
        mode,
        recentTypesRef.current,
        pool,
      );
      recentTypesRef.current = [...recentTypesRef.current.slice(-2), nextChallenge.type];
      const nextGrid = generateGrid(nextChallenge);
      return { nextGrid, nextChallenge };
    }

    // Same challenge, new grid
    const nextGrid = generateGrid(s.currentChallenge);
    return { nextGrid };
  }, [mode, pool]);

  // Reset timer for a new grid
  const resetTimer = useCallback((gridIdx: number) => {
    const duration = getTimerDuration(gridIdx);
    timerDurationRef.current = duration;
    timerStartRef.current = Date.now();
    timerProgress.value = 1;
  }, [timerProgress]);

  // Advance to next grid (called after correct answer or timeout)
  const advanceGrid = useCallback(() => {
    if (isAdvancingRef.current) return;
    if (stateRef.current.phase === 'gameOver') return;
    isAdvancingRef.current = true;

    const { nextGrid, nextChallenge } = generateNextGridData();
    dispatch({ type: 'ADVANCE_GRID', nextGrid, nextChallenge });

    // Calculate the next gridIndex for timer reset
    const s = stateRef.current;
    const nextGridIndex = s.gridIndex + 1 >= 5 ? 0 : s.gridIndex + 1;
    resetTimer(nextGridIndex);

    // Small delay before allowing next advance
    setTimeout(() => {
      isAdvancingRef.current = false;
    }, 100);
  }, [generateNextGridData, resetTimer]);

  // Timer tick (100ms interval)
  useEffect(() => {
    if (state.phase === 'gameOver') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Elapsed seconds tracker
    const elapsedInterval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - gameStartRef.current) / 1000));
    }, 1000);

    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - timerStartRef.current) / 1000;
      const duration = timerDurationRef.current;
      const remaining = Math.max(0, duration - elapsed);
      const progress = duration > 0 ? remaining / duration : 0;
      timerProgress.value = progress;

      if (remaining <= 0 && !isAdvancingRef.current) {
        // Timer expired
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        dispatch({ type: 'TIMEOUT' });

        // Check if game over after timeout (stateRef will update on next render)
        // We need to check hearts directly since dispatch is async
        const s = stateRef.current;
        if (s.hearts - 1 > 0 || s.mode === 'blitz') {
          advanceGrid();
        }
      }
    }, 100);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      clearInterval(elapsedInterval);
    };
  }, [state.phase, timerProgress, advanceGrid]);

  // Handle cell tap
  const tapCell = useCallback((index: number) => {
    const s = stateRef.current;
    if (s.phase === 'gameOver') return;
    if (isAdvancingRef.current) return;

    const elapsed = (Date.now() - timerStartRef.current) / 1000;
    const duration = timerDurationRef.current;
    const timeRemaining = Math.max(0, duration - elapsed);

    const isCorrect = s.currentGrid.correctIndices.includes(index);

    dispatch({ type: 'TAP_CELL', index, timeRemaining });

    if (isCorrect) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // Brief delay for feedback, then advance
      setTimeout(() => {
        if (stateRef.current.phase !== 'gameOver') {
          advanceGrid();
        }
      }, 300);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  }, [advanceGrid]);

  // Get current time remaining (for sum_to_n multi-tap scenarios)
  const getTimeRemaining = useCallback(() => {
    const elapsed = (Date.now() - timerStartRef.current) / 1000;
    return Math.max(0, timerDurationRef.current - elapsed);
  }, []);

  return {
    state,
    tapCell,
    timerProgress,
    timerDuration,
    elapsedSeconds,
    isReady,
    getTimeRemaining,
  };
}
