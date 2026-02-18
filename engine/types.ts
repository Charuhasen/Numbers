// Game engine types — zero React/RN imports

export type GameMode = 'classic' | 'blitz';

export type ChallengeType =
  | 'highest'
  | 'lowest'
  | 'closest'
  | 'odd_one_out'
  | 'prime'
  | 'match'
  | 'property';

export type Difficulty = 'easy' | 'medium' | 'hard';

export type GamePhase = 'playing' | 'gameOver';

export type GameEventType = 'correct' | 'wrong' | 'timeout' | 'grid_skip';

/** @deprecated Rule-based generation replaced by pre-generated boards. */
export interface GridRules {
  min_value: number;
  max_value: number;
  distractor_min_delta: number;
  distractor_max_delta: number;
  target_value?: number;
  required_selections: number;
}

/** @deprecated Rule-based generation replaced by pre-generated boards. */
export interface Challenge {
  id: string;
  instruction: string;
  type: ChallengeType;
  difficulty: Difficulty;
  rules: GridRules;
}

export interface Board {
  id: string;
  type: ChallengeType;
  difficulty: Difficulty;
  instruction: string;
  grids: {
    grid: number[];             // length 9
    correct_answers: number[];  // indices of correct answers
  }[];                          // Exactly 5 grids per board
  estimated_solve_time_ms: number;
  difficulty_score: number;
}

export interface Grid {
  numbers: number[];          // from board.grid
  correctAnswers: number[];   // from board.correct_answers
  boardId: string;            // track which board was used
  instruction: string;        // from board.instruction
  type: ChallengeType;        // from board.type
  estimatedSolveTimeMs: number; // from board.estimated_solve_time_ms
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
  currentChallengeType: ChallengeType;
  currentInstruction: string;
  events: GameEvent[];
}

export type GameAction =
  | { type: 'TAP_CELL'; index: number; timeRemaining: number }
  | { type: 'TIMEOUT' }
  | { type: 'ADVANCE_GRID'; nextGrid: Grid; nextChallengeType?: ChallengeType; nextInstruction?: string };
