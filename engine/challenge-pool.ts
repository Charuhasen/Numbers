import { Challenge, ChallengeType, Difficulty, GameMode } from './types';

// Import challenge JSON files
import easyRaw from '@/assets/challenges/easy.json';
import mediumRaw from '@/assets/challenges/medium.json';
import hardRaw from '@/assets/challenges/hard.json';

export interface ChallengePool {
  easy: Challenge[];
  medium: Challenge[];
  hard: Challenge[];
}

export function loadChallengePool(): ChallengePool {
  return {
    easy: easyRaw as Challenge[],
    medium: mediumRaw as Challenge[],
    hard: hardRaw as Challenge[],
  };
}

/**
 * Classic difficulty scaling based on challenge index (0-based).
 * 1-5 → Easy, 6-10 → Easy+Medium, 11-15 → Medium, 16-20 → Medium+Hard, 21+ → Hard
 */
function getDifficultyTier(challengeIndex: number, mode: GameMode): Difficulty[] {
  if (mode === 'blitz') return ['medium'];

  // challengeIndex is 0-based, spec uses 1-based ranges
  const n = challengeIndex + 1;

  if (n <= 5) return ['easy'];
  if (n <= 10) return ['easy', 'medium'];
  if (n <= 15) return ['medium'];
  if (n <= 20) return ['medium', 'hard'];
  return ['hard'];
}

/**
 * Pick the next challenge, avoiding recent types.
 * Returns a randomly selected challenge from the appropriate difficulty tier.
 */
export function getNextChallenge(
  challengeIndex: number,
  mode: GameMode,
  recentTypes: ChallengeType[],
  pool: ChallengePool,
): Challenge {
  const tiers = getDifficultyTier(challengeIndex, mode);

  // Collect all challenges from allowed tiers
  const candidates: Challenge[] = [];
  for (const tier of tiers) {
    candidates.push(...pool[tier]);
  }

  if (candidates.length === 0) {
    throw new Error('No challenges available for the current difficulty tier');
  }

  // Filter out recently used types (last 3)
  const recentSet = new Set(recentTypes.slice(-3));
  const filtered = candidates.filter((c) => !recentSet.has(c.type));

  // If all types were recently used, fall back to all candidates
  const selection = filtered.length > 0 ? filtered : candidates;

  // Pick a random challenge
  return selection[Math.floor(Math.random() * selection.length)];
}
