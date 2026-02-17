import { Difficulty, GameEvent, GameMode } from '@/engine/types';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_SCORES_KEY = 'taptapmath_pending_scores';

interface ScoreSubmission {
  mode: GameMode;
  difficulty: Difficulty;
  events: GameEvent[];
  roundReached: number;
}

export interface SubmitResult {
  success: boolean;
  score: number;
  bitsEarned: number;
  scoreId: string;
  isNewBest: boolean;
}

/** Map camelCase GameEvent fields to snake_case for the RPC. */
function toSnakeCaseEvents(events: GameEvent[]): object[] {
  return events.map((e) => ({
    type: e.type,
    grid_index: e.gridIndex,
    challenge_index: e.challengeIndex,
    time_remaining: e.timeRemaining,
    timestamp: e.timestamp,
  }));
}

/** Submit a game score via the submit_game_score RPC. */
export async function submitGameScore(
  mode: GameMode,
  difficulty: Difficulty,
  events: GameEvent[],
  roundReached: number,
): Promise<SubmitResult> {
  const { data, error } = await supabase.rpc('submit_game_score', {
    p_mode: mode,
    p_difficulty: difficulty,
    p_events: toSnakeCaseEvents(events),
    p_round_reached: roundReached,
  });

  if (error) throw error;

  return {
    success: data.success,
    score: data.score,
    bitsEarned: data.bits_earned,
    scoreId: data.score_id,
    isNewBest: data.is_new_best,
  };
}

/** Queue a failed score submission for offline retry. */
export async function queuePendingScore(submission: ScoreSubmission) {
  const existing = await AsyncStorage.getItem(PENDING_SCORES_KEY);
  const queue: ScoreSubmission[] = existing ? JSON.parse(existing) : [];
  queue.push(submission);
  await AsyncStorage.setItem(PENDING_SCORES_KEY, JSON.stringify(queue));
}

/** Flush all queued score submissions. Returns the number successfully processed. */
export async function processPendingScores(): Promise<number> {
  const existing = await AsyncStorage.getItem(PENDING_SCORES_KEY);
  if (!existing) return 0;

  const queue: ScoreSubmission[] = JSON.parse(existing);
  if (queue.length === 0) return 0;

  const remaining: ScoreSubmission[] = [];
  let processed = 0;

  for (const submission of queue) {
    try {
      await submitGameScore(
        submission.mode,
        submission.difficulty,
        submission.events,
        submission.roundReached,
      );
      processed++;
    } catch {
      remaining.push(submission);
    }
  }

  if (remaining.length > 0) {
    await AsyncStorage.setItem(PENDING_SCORES_KEY, JSON.stringify(remaining));
  } else {
    await AsyncStorage.removeItem(PENDING_SCORES_KEY);
  }

  return processed;
}
