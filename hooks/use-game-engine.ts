import { getNextBoard, loadBoardPool } from '@/engine/board-pool';
import { createInitialState } from '@/engine/game-init';
import { gameReducer } from '@/engine/game-reducer';
import { Board, ChallengeType, GameMode, GameState, Grid } from '@/engine/types';
import { impact } from '@/lib/haptics';
import { ImpactFeedbackStyle } from 'expo-haptics';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  cancelAnimation,
  Easing,
  runOnJS,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

function boardToGrid(board: Board, gridIndex: number): Grid {
  return {
    numbers: board.grids[gridIndex].grid,
    correctAnswers: board.grids[gridIndex].correct_answers,
    boardId: board.id,
    instruction: board.instruction,
    type: board.type,
    timeAllowedMs: board.time_allowed_ms,
  };
}

export function useGameEngine(
  mode: GameMode,
  onRevealCorrect: (indices: number[]) => void,
  onTimeout: () => void,
) {
  const pool = useMemo<Board[]>(() => loadBoardPool(mode), [mode]);
  const recentTypesRef = useRef<ChallengeType[]>([]);
  const recentBoardIdsRef = useRef<string[]>([]);

  // Generate first board
  const initialData = useMemo(() => {
    const board = getNextBoard(0, mode, [], [], pool);
    recentTypesRef.current = [board.type];
    recentBoardIdsRef.current = [board.id];
    return { board };
  }, [mode, pool]);

  const currentBoardRef = useRef<Board>(initialData.board);

  const [state, dispatch] = useReducer(
    gameReducer,
    createInitialState(mode, initialData.board),
  );

  // Timer shared value for the animated bar (1.0 -> 0.0) — driven by withTiming on the UI thread
  const timerProgress = useSharedValue(1);
  const timerDuration = state.currentGrid.timeAllowedMs / 1000;

  // Refs for timer management (avoids re-renders)
  const timerStartRef = useRef<number>(Date.now());
  const timerDurationRef = useRef<number>(timerDuration);
  const stateRef = useRef<GameState>(state);
  const isAdvancingRef = useRef(false);
  const isPausedRef = useRef(true); // start paused for initial banner
  const pausedElapsedRef = useRef(0); // elapsed seconds at time of pause

  // Stable timestamp for elapsed time — StatsBar reads this and self-ticks
  const gameStartRef = useRef<number>(Date.now());

  // Keep stateRef in sync
  stateRef.current = state;

  // Track isReady
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(true);
  }, []);

  // Generate next grid (and potentially next challenge type)
  const generateNextGridData = useCallback(() => {
    const s = stateRef.current;
    const nextGridIndex = s.gridIndex + 1;

    if (nextGridIndex >= 5) {
      // New challenge round — pick a new board with type variety
      const nextChallengeIndex = s.challengeIndex + 1;
      const nextBoard = getNextBoard(
        nextChallengeIndex,
        mode,
        recentTypesRef.current,
        recentBoardIdsRef.current,
        pool,
      );
      currentBoardRef.current = nextBoard;
      recentTypesRef.current = [...recentTypesRef.current.slice(-2), nextBoard.type];
      recentBoardIdsRef.current = [...recentBoardIdsRef.current, nextBoard.id];
      const nextGrid = boardToGrid(nextBoard, 0);
      return { nextGrid, nextChallengeType: nextBoard.type, nextInstruction: nextBoard.instruction };
    }

    // Same challenge type, NEXT grid from the SAME board
    const nextGrid = boardToGrid(currentBoardRef.current, nextGridIndex);
    return { nextGrid };
  }, [mode, pool]);

  // Holds the latest handler — never passed to a worklet, only read on the JS thread
  const handleTimerExpiredRef = useRef<() => void>(() => {});

  // Stable wrapper with empty deps — safe to capture inside a Reanimated worklet.
  // When the UI thread fires the completion callback it runOnJS-bounces here, which
  // then calls the mutable ref on the JS thread (no worklet access to the ref).
  const onTimerComplete = useCallback(() => {
    handleTimerExpiredRef.current();
  }, []);

  // Start a UI-thread withTiming animation for the timer bar
  const startTimerAnimation = useCallback((durationMs: number) => {
    timerProgress.value = withTiming(0, {
      duration: Math.max(0, durationMs),
      easing: Easing.linear,
    }, (finished) => {
      if (finished) {
        runOnJS(onTimerComplete)();
      }
    });
  }, [timerProgress, onTimerComplete]);

  // Reset timer for a new grid
  const resetTimer = useCallback((timeAllowedMs: number) => {
    const duration = timeAllowedMs / 1000;
    timerDurationRef.current = duration;
    timerStartRef.current = Date.now();
    pausedElapsedRef.current = 0;
    timerProgress.value = 1; // cancels any in-progress animation
    if (!isPausedRef.current) {
      startTimerAnimation(timeAllowedMs);
    }
  }, [timerProgress, startTimerAnimation]);

  // Pause timer (for challenge banner)
  const pauseTimer = useCallback(() => {
    if (isPausedRef.current) return;
    isPausedRef.current = true;
    cancelAnimation(timerProgress);
    pausedElapsedRef.current = (Date.now() - timerStartRef.current) / 1000;
  }, [timerProgress]);

  // Resume timer after banner dismissal
  const resumeTimer = useCallback(() => {
    if (!isPausedRef.current) return;
    isPausedRef.current = false;
    // Restore effective start so getTimeRemaining stays accurate
    timerStartRef.current = Date.now() - pausedElapsedRef.current * 1000;
    const remainingMs = (timerDurationRef.current - pausedElapsedRef.current) * 1000;
    startTimerAnimation(remainingMs);
  }, [startTimerAnimation]);

  // Advance to next grid (called after correct answer or timeout)
  const advanceGrid = useCallback(() => {
    if (isAdvancingRef.current) return;
    if (stateRef.current.phase === 'gameOver') return;
    isAdvancingRef.current = true;

    const s = stateRef.current;
    const isNewChallenge = s.gridIndex + 1 >= 5;

    const { nextGrid, nextChallengeType, nextInstruction } = generateNextGridData();
    dispatch({ type: 'ADVANCE_GRID', nextGrid, nextChallengeType, nextInstruction });

    // Pause before resetTimer when a new challenge starts so the banner controls resume
    if (isNewChallenge) {
      isPausedRef.current = true;
      pausedElapsedRef.current = 0;
    }

    resetTimer(nextGrid.timeAllowedMs);

    // Small delay before allowing next advance
    setTimeout(() => {
      isAdvancingRef.current = false;
    }, 100);
  }, [generateNextGridData, resetTimer]);

  // Handle timer expiry — called from UI thread via runOnJS
  const handleTimerExpired = useCallback(() => {
    if (isPausedRef.current) return;
    if (isAdvancingRef.current) return;
    if (stateRef.current.phase === 'gameOver') return;

    isAdvancingRef.current = true;
    impact(ImpactFeedbackStyle.Heavy);
    dispatch({ type: 'TIMEOUT' });

    const s = stateRef.current;
    onTimeout();
    onRevealCorrect(s.currentGrid.correctAnswers);

    if (s.hearts - 1 > 0) {
      setTimeout(() => {
        isAdvancingRef.current = false;
        advanceGrid();
      }, 600);
    }
  }, [advanceGrid, onTimeout, onRevealCorrect]);

  // Keep the JS-thread ref pointing at the latest handler (never read in a worklet)
  handleTimerExpiredRef.current = handleTimerExpired;

  // Cancel animation when game ends
  useEffect(() => {
    if (state.phase === 'gameOver') {
      cancelAnimation(timerProgress);
    }
  }, [state.phase, timerProgress]);

  // Handle cell tap
  const tapCell = useCallback((index: number) => {
    const s = stateRef.current;
    if (s.phase === 'gameOver') return;
    if (isAdvancingRef.current) return;

    const elapsed = (Date.now() - timerStartRef.current) / 1000;
    const duration = timerDurationRef.current;

    // Reject taps only when the clock has actually reached zero
    if (elapsed >= duration) return;

    const timeRemaining = duration - elapsed;

    const isCorrect = s.currentGrid.correctAnswers.includes(index);

    dispatch({ type: 'TAP_CELL', index, timeRemaining });

    // Lock immediately and freeze the bar animation
    isAdvancingRef.current = true;
    cancelAnimation(timerProgress);

    if (isCorrect) {
      impact(ImpactFeedbackStyle.Medium);
      setTimeout(() => {
        if (stateRef.current.phase !== 'gameOver') {
          isAdvancingRef.current = false;
          advanceGrid();
        }
      }, 300);
    } else {
      impact(ImpactFeedbackStyle.Heavy);
      // Reveal the correct answer, then advance after the player has seen it
      onRevealCorrect(s.currentGrid.correctAnswers);
      setTimeout(() => {
        if (stateRef.current.phase !== 'gameOver') {
          isAdvancingRef.current = false;
          advanceGrid();
        }
      }, 600);
    }
  }, [advanceGrid, timerProgress]);

  const getTimeRemaining = useCallback(() => {
    const elapsed = (Date.now() - timerStartRef.current) / 1000;
    return Math.max(0, timerDurationRef.current - elapsed);
  }, []);

  return {
    state,
    tapCell,
    timerProgress,
    timerDuration,
    // Expose start timestamp so consumers can compute elapsed time locally
    gameStartTime: gameStartRef.current,
    isReady,
    getTimeRemaining,
    pauseTimer,
    resumeTimer,
  };
}
