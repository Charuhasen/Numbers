// Game engine types — zero React/RN imports

export type GameMode = 'classic';

export type ChallengeType =
  | 'highest'
  | 'lowest'
  | 'closest'
  | 'odd_one_out'
  | 'prime'
  | 'match'
  | 'property';

type GamePhase = 'playing' | 'gameOver';

type GameEventType = 'correct' | 'wrong' | 'timeout' | 'grid_skip';

export interface Board {
  id: string;
  type: ChallengeType;
  instruction: string;
  instruction_complexity_index: number;
  time_allowed_ms: number;
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
  timeAllowedMs: number;      // from board.time_allowed_ms
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
