import { getNextBoard, loadBoardPool } from '@/engine/board-pool';
import { createInitialState } from '@/engine/game-init';
import { gameReducer } from '@/engine/game-reducer';
import { Board, ChallengeType, GameMode, GameState, Grid } from '@/engine/types';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';

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

export function useGameEngine(mode: GameMode, onRevealCorrect: (indices: number[]) => void) {
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

  // Timer shared value for the animated bar (1.0 -> 0.0)
  const timerProgress = useSharedValue(1);
  const timerDuration = state.currentGrid.timeAllowedMs / 1000;

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

  // Reset timer for a new grid
  const resetTimer = useCallback((timeAllowedMs: number) => {
    const duration = timeAllowedMs / 1000;
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

    resetTimer(nextGrid.timeAllowedMs);

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
        // Block re-entry during the reveal window
        isAdvancingRef.current = true;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        dispatch({ type: 'TIMEOUT' });

        // Reveal the correct answer, then advance after a short pause
        const s = stateRef.current;
        onRevealCorrect(s.currentGrid.correctAnswers);

        if (s.hearts - 1 > 0) {
          setTimeout(() => {
            isAdvancingRef.current = false;
            advanceGrid();
          }, 600);
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

    // Reject taps only when the clock has actually reached zero
    if (elapsed >= duration) return;

    const timeRemaining = duration - elapsed;

    const isCorrect = s.currentGrid.correctAnswers.includes(index);

    dispatch({ type: 'TAP_CELL', index, timeRemaining });

    if (isCorrect) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setTimeout(() => {
        if (stateRef.current.phase !== 'gameOver') {
          advanceGrid();
        }
      }, 300);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      // Reveal the correct answer, then advance after the player has seen it
      onRevealCorrect(s.currentGrid.correctAnswers);
      setTimeout(() => {
        if (stateRef.current.phase !== 'gameOver') {
          advanceGrid();
        }
      }, 600);
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
