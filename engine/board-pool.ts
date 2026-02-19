import boards from '@/assets/boards/classic/questions.json';
import { Board, ChallengeType, GameMode } from './types';

const ALL_BOARDS: Board[] = boards as Board[];

export function loadBoardPool(_mode: GameMode): Board[] {
  return ALL_BOARDS;
}

/**
 * Pick the next board, avoiding recently-used challenge types and board IDs.
 */
export function getNextBoard(
  _challengeIndex: number,
  _mode: GameMode,
  recentTypes: ChallengeType[],
  recentBoardIds: string[],
  pool: Board[],
): Board {
  if (pool.length === 0) {
    throw new Error('Board pool is empty');
  }

  // Filter out recently used types (last 3)
  const recentTypeSet = new Set(recentTypes.slice(-3));
  let filtered = pool.filter((b) => !recentTypeSet.has(b.type));

  // If all types were recently used, fall back to full pool
  if (filtered.length === 0) filtered = pool;

  // Filter out recently used board IDs
  const recentIdSet = new Set(recentBoardIds);
  let finalFiltered = filtered.filter((b) => !recentIdSet.has(b.id));

  // If all boards were recently used, fall back
  if (finalFiltered.length === 0) finalFiltered = filtered;

  return finalFiltered[Math.floor(Math.random() * finalFiltered.length)];
}

/**
 * Validates every board in the pool has correct structure.
 * Returns an array of error messages (empty = all valid).
 */
export function validateBoardPool(pool: Board[]): string[] {
  const errors: string[] = [];
  for (const board of pool) {
    for (const entry of board.grids) {
      if (entry.grid.length !== 9) {
        errors.push(`${board.id}: grid length is ${entry.grid.length}, expected 9`);
      }
      if (!entry.correct_answers || entry.correct_answers.length === 0) {
        errors.push(`${board.id}: correct_answers is empty`);
      }
      for (const idx of entry.correct_answers) {
        if (idx < 0 || idx >= 9) {
          errors.push(`${board.id}: correct_answers index ${idx} out of bounds`);
        }
      }
    }
  }
  return errors;
}
