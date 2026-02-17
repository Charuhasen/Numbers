import easyBoards from '@/assets/boards/easy.json';
import mediumBoards from '@/assets/boards/medium.json';
import hardBoards from '@/assets/boards/hard.json';
import { Board, ChallengeType, Difficulty, GameMode } from './types';

export interface BoardPool {
  easy: Board[];
  medium: Board[];
  hard: Board[];
}

export function loadBoardPool(): BoardPool {
  return {
    easy: easyBoards as Board[],
    medium: mediumBoards as Board[],
    hard: hardBoards as Board[],
  };
}

/**
 * Classic difficulty scaling based on challenge index (0-based).
 * 1-5 -> Easy, 6-10 -> Easy+Medium, 11-15 -> Medium, 16-20 -> Medium+Hard, 21+ -> Hard
 */
function getDifficultyTier(challengeIndex: number, mode: GameMode): Difficulty[] {
  if (mode === 'blitz') return ['medium'];

  const n = challengeIndex + 1;

  if (n <= 5) return ['easy'];
  if (n <= 10) return ['easy', 'medium'];
  if (n <= 15) return ['medium'];
  if (n <= 20) return ['medium', 'hard'];
  return ['hard'];
}

/**
 * Pick the next board, avoiding recent types and recently-used board IDs.
 */
export function getNextBoard(
  challengeIndex: number,
  mode: GameMode,
  recentTypes: ChallengeType[],
  recentBoardIds: string[],
  pool: BoardPool,
  difficultyOverride?: Difficulty,
): Board {
  const tiers = difficultyOverride ? [difficultyOverride] : getDifficultyTier(challengeIndex, mode);

  // Collect all boards from allowed tiers
  const candidates: Board[] = [];
  for (const tier of tiers) {
    candidates.push(...pool[tier]);
  }

  if (candidates.length === 0) {
    throw new Error('No boards available for the current difficulty tier');
  }

  // Filter out recently used types (last 3)
  const recentTypeSet = new Set(recentTypes.slice(-3));
  let filtered = candidates.filter((b) => !recentTypeSet.has(b.type));

  // If all types were recently used, fall back to all candidates
  if (filtered.length === 0) filtered = candidates;

  // Filter out recently used board IDs
  const recentIdSet = new Set(recentBoardIds);
  let finalFiltered = filtered.filter((b) => !recentIdSet.has(b.id));

  // If all boards were recently used, fall back
  if (finalFiltered.length === 0) finalFiltered = filtered;

  return finalFiltered[Math.floor(Math.random() * finalFiltered.length)];
}

/**
 * Validates that every board in the pool has correct structure:
 * - grid has exactly 9 numbers
 * - correct_answers is non-empty
 * - all correct_answers indices are within [0, 8]
 *
 * Returns an array of error messages (empty = all valid).
 */
export function validateBoardPool(pool: BoardPool): string[] {
  const errors: string[] = [];
  for (const tier of ['easy', 'medium', 'hard'] as const) {
    for (const board of pool[tier]) {
      if (board.grid.length !== 9) {
        errors.push(`${board.id}: grid length is ${board.grid.length}, expected 9`);
      }
      if (!board.correct_answers || board.correct_answers.length === 0) {
        errors.push(`${board.id}: correct_answers is empty`);
      }
      for (const idx of board.correct_answers) {
        if (idx < 0 || idx >= 9) {
          errors.push(`${board.id}: correct_answers index ${idx} out of bounds`);
        }
      }
    }
  }
  return errors;
}
