import { GameEvent, GameMode } from '@/engine/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = 'taptapmath_pending_session';

export interface GameSessionData {
  mode: GameMode;
  score: number;
  bitsEarned: number;
  challengeIndex: number;
  elapsedSeconds: number;
  events: GameEvent[];
}

/** Persist session to AsyncStorage so it survives app kills. */
export async function setGameSessionData(data: GameSessionData): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

/** Read persisted session. Returns null if none exists. */
export async function getGameSessionData(): Promise<GameSessionData | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  return raw ? (JSON.parse(raw) as GameSessionData) : null;
}

/** Remove the persisted session after it has been submitted or queued. */
export async function clearGameSessionData(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}
