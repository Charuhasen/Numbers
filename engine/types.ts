// Game engine types — zero React/RN imports

export type GameMode = 'classic' | 'blitz' | 'daily';

export type ChallengeType =
  | 'highest'
  | 'lowest'
  | 'closest'
  | 'odd_one_out'
  | 'prime'
  | 'sum_to_n';

export type Difficulty = 'easy' | 'medium' | 'hard';

export type GamePhase = 'playing' | 'gameOver';

export type GameEventType = 'correct' | 'wrong' | 'timeout' | 'grid_skip';

export interface GridRules {
  min_value: number;
  max_value: number;
  distractor_min_delta: number;
  distractor_max_delta: number;
  target_value?: number;
  required_selections: number;
}

export interface Challenge {
  id: string;
  instruction: string;
  type: ChallengeType;
  difficulty: Difficulty;
  rules: GridRules;
}

export interface Grid {
  numbers: number[];       // length 9
  correctIndices: number[]; // 1 for most types, 2 for sum_to_n
  challenge: Challenge;
}

export interface GameEvent {
  type: GameEventType;
  gridIndex: number;
  challengeIndex: number;
  timeRemaining: number;
  timestamp: number;
}

export interface GameState {
  mode: GameMode;
  hearts: number;
  challengeIndex: number;
  gridIndex: number;         // 0-4 within a challenge
  score: number;
  bitsEarned: number;
  phase: GamePhase;
  currentGrid: Grid;
  currentChallenge: Challenge;
  events: GameEvent[];
}

export type GameAction =
  | { type: 'TAP_CELL'; index: number; timeRemaining: number }
  | { type: 'TIMEOUT' }
  | { type: 'ADVANCE_GRID'; nextGrid: Grid; nextChallenge?: Challenge };
