import { Board, GameMode, GameState } from './types';

export function createInitialState(
  mode: GameMode,
  firstBoard: Board,
): GameState {
  return {
    mode,
    hearts: mode === 'blitz' ? 1 : 3,
    challengeIndex: 0,
    gridIndex: 0,
    score: 0,
    bitsEarned: 0,
    phase: 'playing',
    currentGrid: {
      numbers: firstBoard.grids[0].grid,
      correctAnswers: firstBoard.grids[0].correct_answers,
      boardId: firstBoard.id,
      instruction: firstBoard.instruction,
      type: firstBoard.type,
      timeAllowedMs: firstBoard.time_allowed_ms,
    },
    currentChallengeType: firstBoard.type,
    currentInstruction: firstBoard.instruction,
    events: [],
  };
}

/**
 * @deprecated Use board.estimated_solve_time_ms instead.
 * Timer duration in seconds for a given grid index.
 * Grid 0: 6s, Grid 1: 5s, Grid 2: 4s, Grid 3: 3s, Grid 4: 2s
 */
export function getTimerDuration(gridIndex: number): number {
  return Math.max(6.0 - gridIndex * 1.0, 2.0);
}
