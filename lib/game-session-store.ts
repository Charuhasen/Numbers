import { Difficulty, GameEvent, GameMode } from '@/engine/types';

export interface GameSessionData {
  mode: GameMode;
  score: number;
  bitsEarned: number;
  challengeIndex: number;
  elapsedSeconds: number;
  events: GameEvent[];
  difficulty?: Difficulty;
}

let sessionData: GameSessionData | null = null;

export function setGameSessionData(data: GameSessionData) {
  sessionData = data;
}

export function getGameSessionData(): GameSessionData | null {
  return sessionData;
}

export function clearGameSessionData() {
  sessionData = null;
}
