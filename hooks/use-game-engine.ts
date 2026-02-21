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
  makeMutable,
  runOnJS,
  SharedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const BLITZ_DURATION_SEC = 60;
const TIME_FREEZE_DURATION_MS = 5000;

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
  const isBlitz = mode === 'blitz';
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

  // Per-grid timer shared value (Classic only — 1.0 -> 0.0)
  const timerProgress = useSharedValue(1);
  const timerDuration = state.currentGrid.timeAllowedMs / 1000;

  // Global timer for Blitz mode (60 -> 0)
  const globalTimeRemaining = useSharedValue(BLITZ_DURATION_SEC);

  // Refs for timer management (avoids re-renders)
  const timerStartRef = useRef<number>(Date.now());
  const timerDurationRef = useRef<number>(timerDuration);
  const stateRef = useRef<GameState>(state);
  const isAdvancingRef = useRef(false);
  const isPausedRef = useRef(true); // start paused for initial banner
  const pausedElapsedRef = useRef(0); // elapsed seconds at time of pause

  // Blitz global timer refs
  const globalTimerStartRef = useRef<number>(0);
  const globalPausedElapsedRef = useRef(0); // how many seconds have elapsed when paused

  // Time Freeze potion state
  const timerFrozen = useSharedValue(0); // 0 = not frozen, 1 = frozen (for UI)
  const freezeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ─── Per-grid timer logic (Classic only) ───────────────────────────

  // Holds the latest handler — never passed to a worklet, only read on the JS thread
  const handleTimerExpiredRef = useRef<() => void>(() => {});

  // Stable wrapper with empty deps — safe to capture inside a Reanimated worklet.
  const onTimerComplete = useCallback(() => {
    handleTimerExpiredRef.current();
  }, []);

  // Start a UI-thread withTiming animation for the per-grid timer bar
  const startTimerAnimation = useCallback((durationMs: number) => {
    if (isBlitz) return; // Blitz doesn't use per-grid timer
    timerProgress.value = withTiming(0, {
      duration: Math.max(0, durationMs),
      easing: Easing.linear,
    }, (finished) => {
      if (finished) {
        runOnJS(onTimerComplete)();
      }
    });
  }, [isBlitz, timerProgress, onTimerComplete]);

  // Reset timer for a new grid (Classic only)
  const resetTimer = useCallback((timeAllowedMs: number) => {
    if (isBlitz) return;
    const duration = timeAllowedMs / 1000;
    timerDurationRef.current = duration;
    timerStartRef.current = Date.now();
    pausedElapsedRef.current = 0;
    timerProgress.value = 1; // cancels any in-progress animation
    if (!isPausedRef.current) {
      startTimerAnimation(timeAllowedMs);
    }
  }, [isBlitz, timerProgress, startTimerAnimation]);

  // ─── Blitz global timer logic ──────────────────────────────────────

  const handleGlobalTimeUpRef = useRef<() => void>(() => {});

  const onGlobalTimerComplete = useCallback(() => {
    handleGlobalTimeUpRef.current();
  }, []);

  const startGlobalTimer = useCallback((remainingMs: number) => {
    globalTimerStartRef.current = Date.now();
    globalTimeRemaining.value = remainingMs / 1000;
    globalTimeRemaining.value = withTiming(0, {
      duration: Math.max(0, remainingMs),
      easing: Easing.linear,
    }, (finished) => {
      if (finished) {
        runOnJS(onGlobalTimerComplete)();
      }
    });
  }, [globalTimeRemaining, onGlobalTimerComplete]);

  const pauseGlobalTimer = useCallback(() => {
    cancelAnimation(globalTimeRemaining);
    const elapsedSinceStart = (Date.now() - globalTimerStartRef.current) / 1000;
    globalPausedElapsedRef.current += elapsedSinceStart;
  }, [globalTimeRemaining]);

  const resumeGlobalTimer = useCallback(() => {
    const remainingSec = BLITZ_DURATION_SEC - globalPausedElapsedRef.current;
    if (remainingSec <= 0) return;
    startGlobalTimer(remainingSec * 1000);
  }, [startGlobalTimer]);

  const getGlobalTimeRemaining = useCallback(() => {
    if (isPausedRef.current) {
      return Math.max(0, BLITZ_DURATION_SEC - globalPausedElapsedRef.current);
    }
    const elapsedSinceStart = (Date.now() - globalTimerStartRef.current) / 1000;
    const totalElapsed = globalPausedElapsedRef.current + elapsedSinceStart;
    return Math.max(0, BLITZ_DURATION_SEC - totalElapsed);
  }, []);

  // ─── Unified pause/resume ─────────────────────────────────────────

  // Pause timer (for challenge banner)
  const pauseTimer = useCallback(() => {
    if (isPausedRef.current) return;
    isPausedRef.current = true;
    if (isBlitz) {
      pauseGlobalTimer();
    } else {
      cancelAnimation(timerProgress);
      pausedElapsedRef.current = (Date.now() - timerStartRef.current) / 1000;
    }
  }, [isBlitz, timerProgress, pauseGlobalTimer]);

  // Resume timer after banner dismissal
  const resumeTimer = useCallback(() => {
    if (!isPausedRef.current) return;
    isPausedRef.current = false;
    if (isBlitz) {
      resumeGlobalTimer();
    } else {
      // Restore effective start so getTimeRemaining stays accurate
      timerStartRef.current = Date.now() - pausedElapsedRef.current * 1000;
      const remainingMs = (timerDurationRef.current - pausedElapsedRef.current) * 1000;
      startTimerAnimation(remainingMs);
    }
  }, [isBlitz, startTimerAnimation, resumeGlobalTimer]);

  // ─── Time Freeze potion ─────────────────────────────────────────────

  const freezeTimer = useCallback(() => {
    // Prevent double-freeze or freezing when already paused (e.g. banner)
    if (timerFrozen.value === 1) return;
    if (stateRef.current.phase === 'gameOver') return;

    timerFrozen.value = 1;
    pauseTimer();

    freezeTimeoutRef.current = setTimeout(() => {
      freezeTimeoutRef.current = null;
      timerFrozen.value = 0;
      // Only resume if the game hasn't ended or been paused by a banner during the freeze
      if (stateRef.current.phase !== 'gameOver') {
        resumeTimer();
      }
    }, TIME_FREEZE_DURATION_MS);
  }, [pauseTimer, resumeTimer, timerFrozen]);

  // Clean up freeze timeout on game over or unmount
  useEffect(() => {
    if (state.phase === 'gameOver' && freezeTimeoutRef.current) {
      clearTimeout(freezeTimeoutRef.current);
      freezeTimeoutRef.current = null;
      timerFrozen.value = 0;
    }
  }, [state.phase, timerFrozen]);

  useEffect(() => {
    return () => {
      if (freezeTimeoutRef.current) {
        clearTimeout(freezeTimeoutRef.current);
      }
    };
  }, []);

  // ─── Advance grid ──────────────────────────────────────────────────

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
      // Cancel any active time freeze so it doesn't auto-resume into a banner
      if (freezeTimeoutRef.current) {
        clearTimeout(freezeTimeoutRef.current);
        freezeTimeoutRef.current = null;
        timerFrozen.value = 0;
      }
      isPausedRef.current = true;
      pausedElapsedRef.current = 0;
      if (isBlitz) {
        pauseGlobalTimer();
      }
    }

    if (!isBlitz) {
      resetTimer(nextGrid.timeAllowedMs);
    }

    // Small delay before allowing next advance
    setTimeout(() => {
      isAdvancingRef.current = false;
    }, 100);
  }, [isBlitz, generateNextGridData, resetTimer, pauseGlobalTimer]);

  // ─── Timer expiry handlers ─────────────────────────────────────────

  // Handle per-grid timer expiry (Classic only) — called from UI thread via runOnJS
  const handleTimerExpired = useCallback(() => {
    if (isBlitz) return;
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
  }, [isBlitz, advanceGrid, onTimeout, onRevealCorrect]);

  // Handle global timer expiry (Blitz only)
  const handleGlobalTimeUp = useCallback(() => {
    if (!isBlitz) return;
    if (stateRef.current.phase === 'gameOver') return;

    impact(ImpactFeedbackStyle.Heavy);
    dispatch({ type: 'GLOBAL_TIME_UP' });
  }, [isBlitz]);

  // Keep JS-thread refs pointing at the latest handlers
  handleTimerExpiredRef.current = handleTimerExpired;
  handleGlobalTimeUpRef.current = handleGlobalTimeUp;

  // Cancel animations when game ends
  useEffect(() => {
    if (state.phase === 'gameOver') {
      cancelAnimation(timerProgress);
      if (isBlitz) {
        cancelAnimation(globalTimeRemaining);
      }
    }
  }, [state.phase, timerProgress, globalTimeRemaining, isBlitz]);

  // ─── Cell tap ──────────────────────────────────────────────────────

  const tapCell = useCallback((index: number) => {
    const s = stateRef.current;
    if (s.phase === 'gameOver') return;
    if (isAdvancingRef.current) return;

    let timeRemaining: number;

    if (isBlitz) {
      // In Blitz, use global time remaining for score bonus
      timeRemaining = getGlobalTimeRemaining();
      if (timeRemaining <= 0) return;
    } else {
      const elapsed = (Date.now() - timerStartRef.current) / 1000;
      const duration = timerDurationRef.current;
      // Reject taps only when the clock has actually reached zero
      if (elapsed >= duration) return;
      timeRemaining = duration - elapsed;
    }

    const isCorrect = s.currentGrid.correctAnswers.includes(index);

    dispatch({ type: 'TAP_CELL', index, timeRemaining });

    // Lock immediately and freeze the bar animation
    isAdvancingRef.current = true;
    if (!isBlitz) {
      cancelAnimation(timerProgress);
    }

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
  }, [isBlitz, advanceGrid, timerProgress, getGlobalTimeRemaining, onRevealCorrect]);

  const getTimeRemaining = useCallback(() => {
    if (isBlitz) return getGlobalTimeRemaining();
    const elapsed = (Date.now() - timerStartRef.current) / 1000;
    return Math.max(0, timerDurationRef.current - elapsed);
  }, [isBlitz, getGlobalTimeRemaining]);

  return {
    state,
    tapCell,
    timerProgress,
    timerDuration,
    globalTimeRemaining: isBlitz ? globalTimeRemaining : undefined,
    // Expose start timestamp so consumers can compute elapsed time locally
    gameStartTime: gameStartRef.current,
    isReady,
    getTimeRemaining,
    pauseTimer,
    resumeTimer,
    freezeTimer,
    timerFrozen,
  };
}
