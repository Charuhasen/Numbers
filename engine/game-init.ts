import { Challenge, GameMode, GameState, Grid } from './types';

export function createInitialState(
  mode: GameMode,
  firstChallenge: Challenge,
  firstGrid: Grid,
): GameState {
  return {
    mode,
    hearts: mode === 'blitz' ? 0 : 3,
    challengeIndex: 0,
    gridIndex: 0,
    score: 0,
    bitsEarned: 0,
    phase: 'playing',
    currentGrid: firstGrid,
    currentChallenge: firstChallenge,
    events: [],
  };
}

/**
 * Timer duration in seconds for a given grid index.
 * Grid 0: 6s, Grid 1: 5s, Grid 2: 4s, Grid 3: 3s, Grid 4: 2s
 */
export function getTimerDuration(gridIndex: number): number {
  return Math.max(6.0 - gridIndex * 1.0, 2.0);
}
