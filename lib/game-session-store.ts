import { GameEvent, GameMode } from '@/engine/types';
import { clearGameSession, getActiveGameSession, upsertGameSession } from '@/lib/local-db';

export interface GameSessionData {
  mode: GameMode;
  score: number;
  bitsEarned: number;
  challengeIndex: number;
  elapsedSeconds: number;
  events: GameEvent[];
  /** Server-issued session token from start_game_session RPC. Null for offline games. */
  sessionId: string | null;
}

/** Persist session to SQLite so it survives app kills. */
export function setGameSessionData(data: GameSessionData): void {
  upsertGameSession({
    mode: data.mode,
    score: data.score,
    bits_earned: data.bitsEarned,
    challenge_index: data.challengeIndex,
    elapsed_seconds: data.elapsedSeconds,
    events_json: JSON.stringify(data.events),
    session_id: data.sessionId,
  });
}

/** Read persisted session. Returns null if none exists. */
export function getGameSessionData(): GameSessionData | null {
  const row = getActiveGameSession();
  if (!row) return null;

  return {
    mode: row.mode,
    score: row.score,
    bitsEarned: row.bits_earned,
    challengeIndex: row.challenge_index,
    elapsedSeconds: row.elapsed_seconds,
    events: JSON.parse(row.events_json),
    sessionId: row.session_id,
  };
}

/** Remove the persisted session after it has been submitted or queued. */
export function clearGameSessionData(): void {
  clearGameSession();
}
