import { GameEvent, GameMode } from '@/engine/types';
import { getRetryableScores, incrementScoreRetry, insertLocalScore, markScoreFailed, markScoreSynced } from '@/lib/local-db';
import { supabase } from '@/lib/supabase';
import * as Crypto from 'expo-crypto';

interface ScoreSubmission {
  mode: GameMode;
  events: GameEvent[];
  roundReached: number;
  score: number;
  sessionId: string | null;
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

/**
 * Request a server-issued session token before starting a game.
 * Returns the session_id UUID, or null if the call fails (offline / not authed).
 */
export async function startGameSession(mode: GameMode): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('start_game_session', {
      p_mode: mode,
    });
    if (error || !data?.session_id) return null;
    return data.session_id as string;
  } catch {
    return null;
  }
}

/** Submit a game score via the submit_game_score RPC. */
export async function submitGameScore(
  mode: GameMode,
  events: GameEvent[],
  roundReached: number,
  sessionId: string | null = null,
): Promise<SubmitResult> {
  const params: Record<string, unknown> = {
    p_mode: mode,
    p_events: toSnakeCaseEvents(events),
    p_round_reached: roundReached,
  };
  if (sessionId) params.p_session_id = sessionId;

  const { data, error } = await supabase.rpc('submit_game_score', params);

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return; // Cant queue if not logged into an account in the first place

  const scoreId = Crypto.randomUUID();
  insertLocalScore({
    id: scoreId,
    user_id: user.id,
    mode: submission.mode,
    score: submission.score,
    round_reached: submission.roundReached,
    played_at: new Date().toISOString(),
    sync_status: 'pending',
    events_json: JSON.stringify(submission.events),
  });
}

/** Flush all queued score submissions with exponential backoff. Returns the number successfully processed. */
export async function processPendingScores(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const retryable = getRetryableScores(user.id);
  if (retryable.length === 0) return 0;

  let processed = 0;

  for (const score of retryable) {
    try {
      const events: GameEvent[] = JSON.parse(score.events_json);
      await submitGameScore(
        score.mode,
        events,
        score.round_reached,
        null, // Session IDs expire anyway, and offline games don't have them
      );
      markScoreSynced(score.id);
      processed++;
    } catch (e) {
      console.error('Failed to sync offline score:', e);
      if (score.retry_count >= 4) {
        markScoreFailed(score.id);
      } else {
        incrementScoreRetry(score.id);
      }
    }
  }

  return processed;
}
