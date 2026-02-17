import { BoardPool, getNextBoard, loadBoardPool } from '@/engine/board-pool';
import { createInitialState } from '@/engine/game-init';
import { gameReducer } from '@/engine/game-reducer';
import { Board, ChallengeType, Difficulty, GameMode, GameState, Grid } from '@/engine/types';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';

/**
 * Derive the actual timer duration (seconds) from a board's estimated solve
 * time and the current grid position within the round (0-4).
 *
 * Formula: base = solveEstimate/1000 + 3s buffer, then decay 0.5s per grid.
 * Clamped to [2s, 8s].
 */
function getTimerForGrid(estimatedSolveTimeMs: number, gridIndex: number): number {
  const baseSec = estimatedSolveTimeMs / 1000 + 3.0;
  const decayed = baseSec - gridIndex * 0.5;
  return Math.min(Math.max(decayed, 2.0), 8.0);
}

function boardToGrid(board: Board): Grid {
  return {
    numbers: board.grid,
    correctAnswers: board.correct_answers,
    boardId: board.id,
    instruction: board.instruction,
    type: board.type,
    estimatedSolveTimeMs: board.estimated_solve_time_ms,
  };
}

export function useGameEngine(mode: GameMode, difficulty?: Difficulty) {
  const pool = useMemo<BoardPool>(() => loadBoardPool(), []);
  const recentTypesRef = useRef<ChallengeType[]>([]);
  const recentBoardIdsRef = useRef<string[]>([]);

  // Generate first board
  const initialData = useMemo(() => {
    const board = getNextBoard(0, mode, [], [], pool, difficulty);
    recentTypesRef.current = [board.type];
    recentBoardIdsRef.current = [board.id];
    return { board };
  }, [mode, pool, difficulty]);

  const [state, dispatch] = useReducer(
    gameReducer,
    createInitialState(mode, initialData.board),
  );

  // Timer shared value for the animated bar (1.0 -> 0.0)
  const timerProgress = useSharedValue(1);
  const timerDuration = getTimerForGrid(state.currentGrid.estimatedSolveTimeMs, state.gridIndex);

  // Refs for timer management (avoids re-renders)
  const timerStartRef = useRef<number>(Date.now());
  const timerDurationRef = useRef<number>(timerDuration);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<GameState>(state);
  const isAdvancingRef = useRef(false);
  const isPausedRef = useRef(true); // start paused for initial banner
  const pausedElapsedRef = useRef(0); // time already elapsed when paused

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
        difficulty,
      );
      recentTypesRef.current = [...recentTypesRef.current.slice(-2), nextBoard.type];
      recentBoardIdsRef.current = [...recentBoardIdsRef.current, nextBoard.id];
      const nextGrid = boardToGrid(nextBoard);
      return { nextGrid, nextChallengeType: nextBoard.type, nextInstruction: nextBoard.instruction };
    }

    // Same challenge type, new board (same type constraint)
    const nextBoard = getNextBoard(
      s.challengeIndex,
      mode,
      // Don't filter by recent types — stay on same challenge type within a round
      [],
      recentBoardIdsRef.current,
      pool,
      difficulty,
    );
    recentBoardIdsRef.current = [...recentBoardIdsRef.current, nextBoard.id];
    const nextGrid = boardToGrid(nextBoard);
    return { nextGrid };
  }, [mode, pool, difficulty]);

  // Reset timer for a new grid
  const resetTimer = useCallback((solveTimeMs: number, gridIndex: number) => {
    const duration = getTimerForGrid(solveTimeMs, gridIndex);
    timerDurationRef.current = duration;
    timerStartRef.current = Date.now();
    pausedElapsedRef.current = 0;
    timerProgress.value = 1;
  }, [timerProgress]);

  // Pause / resume timer (for challenge banner)
  const pauseTimer = useCallback(() => {
    if (isPausedRef.current) return;
    isPausedRef.current = true;
    // Snapshot how much time has elapsed so far
    pausedElapsedRef.current = (Date.now() - timerStartRef.current) / 1000;
  }, []);

  const resumeTimer = useCallback(() => {
    if (!isPausedRef.current) return;
    isPausedRef.current = false;
    // Shift the start time so the elapsed snapshot is preserved
    timerStartRef.current = Date.now() - pausedElapsedRef.current * 1000;
  }, []);

  // Advance to next grid (called after correct answer or timeout)
  const advanceGrid = useCallback(() => {
    if (isAdvancingRef.current) return;
    if (stateRef.current.phase === 'gameOver') return;
    isAdvancingRef.current = true;

    const s = stateRef.current;
    const isNewChallenge = s.gridIndex + 1 >= 5;
    const nextGridIndex = isNewChallenge ? 0 : s.gridIndex + 1;

    const { nextGrid, nextChallengeType, nextInstruction } = generateNextGridData();
    dispatch({ type: 'ADVANCE_GRID', nextGrid, nextChallengeType, nextInstruction });

    resetTimer(nextGrid.estimatedSolveTimeMs, nextGridIndex);

    // Pause timer if a new challenge is starting (banner will resume it)
    if (isNewChallenge) {
      isPausedRef.current = true;
      pausedElapsedRef.current = 0;
    }

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
      if (isPausedRef.current) return;

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

    const isCorrect = s.currentGrid.correctAnswers.includes(index);

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
    pauseTimer,
    resumeTimer,
  };
}
