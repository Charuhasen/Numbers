/**
 * Board generation script.
 * Reads challenge templates from assets/challenges/*.json, generates
 * pre-validated board instances, and writes them to assets/boards/*.json.
 *
 * Usage: npx tsx scripts/generate-boards.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types (mirrored from engine/types.ts to keep script self-contained)
// ---------------------------------------------------------------------------

type ChallengeType = 'highest' | 'lowest' | 'closest' | 'odd_one_out' | 'prime';
type Difficulty = 'easy' | 'medium' | 'hard';

interface GridRules {
  min_value: number;
  max_value: number;
  distractor_min_delta: number;
  distractor_max_delta: number;
  target_value?: number;
  required_selections: number;
}

interface Challenge {
  id: string;
  instruction: string;
  type: ChallengeType;
  difficulty: Difficulty;
  rules: GridRules;
}

interface Board {
  id: string;
  type: ChallengeType;
  difficulty: Difficulty;
  instruction: string;
  grid: number[];
  correct_answers: number[];
  estimated_solve_time_ms: number;
  difficulty_score: number;
}

// ---------------------------------------------------------------------------
// Helpers (ported from engine/grid-generator.ts)
// ---------------------------------------------------------------------------

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randIntExcluding(min: number, max: number, exclude: Set<number>): number {
  let val: number;
  let attempts = 0;
  do {
    val = randInt(min, max);
    attempts++;
    if (attempts > 1000) throw new Error('Cannot generate unique number');
  } while (exclude.has(val));
  return val;
}

// ---------------------------------------------------------------------------
// Grid generators (one per challenge type)
// ---------------------------------------------------------------------------

function generateHighest(challenge: Challenge): { grid: number[]; correctAnswers: number[] } {
  const { min_value, max_value, distractor_min_delta, distractor_max_delta } = challenge.rules;
  const used = new Set<number>();

  const correctMin = Math.floor(max_value * 0.7);
  const correct = randInt(correctMin, max_value);
  used.add(correct);

  const distractors: number[] = [];
  const distLow = Math.max(min_value, correct - distractor_max_delta);
  const distHigh = Math.max(distLow, correct - distractor_min_delta);
  for (let i = 0; i < 8; i++) {
    const d = randIntExcluding(distLow, distHigh, used);
    used.add(d);
    distractors.push(d);
  }

  const numbers = shuffleArray([correct, ...distractors]);
  return { grid: numbers, correctAnswers: [numbers.indexOf(correct)] };
}

function generateLowest(challenge: Challenge): { grid: number[]; correctAnswers: number[] } {
  const { min_value, max_value, distractor_min_delta, distractor_max_delta } = challenge.rules;
  const used = new Set<number>();

  const correctMax = Math.floor(min_value + (max_value - min_value) * 0.3);
  const correct = randInt(min_value, correctMax);
  used.add(correct);

  const distractors: number[] = [];
  const distLow = correct + distractor_min_delta;
  const distHigh = Math.min(max_value, correct + distractor_max_delta);
  for (let i = 0; i < 8; i++) {
    const d = randIntExcluding(distLow, distHigh, used);
    used.add(d);
    distractors.push(d);
  }

  const numbers = shuffleArray([correct, ...distractors]);
  return { grid: numbers, correctAnswers: [numbers.indexOf(correct)] };
}

function generateClosest(challenge: Challenge): { grid: number[]; correctAnswers: number[] } {
  const { min_value, max_value, distractor_min_delta, distractor_max_delta, target_value } = challenge.rules;
  if (target_value === undefined) throw new Error('closest requires target_value');

  const used = new Set<number>();

  const closeDelta = Math.max(1, Math.floor(distractor_min_delta / 2));
  let correct: number;
  if (target_value >= min_value && target_value <= max_value) {
    correct = target_value;
  } else {
    correct = randInt(
      Math.max(min_value, target_value - closeDelta),
      Math.min(max_value, target_value + closeDelta),
    );
  }
  used.add(correct);
  const correctDist = Math.abs(correct - target_value);

  const distractors: number[] = [];
  for (let i = 0; i < 8; i++) {
    let attempts = 0;
    let d: number;
    do {
      const delta = randInt(distractor_min_delta, distractor_max_delta);
      d = Math.random() < 0.5 ? target_value + delta : target_value - delta;
      d = Math.max(min_value, Math.min(max_value, d));
      attempts++;
      if (attempts > 1000) break;
    } while (used.has(d) || Math.abs(d - target_value) <= correctDist);
    used.add(d);
    distractors.push(d);
  }

  const numbers = shuffleArray([correct, ...distractors]);
  return { grid: numbers, correctAnswers: [numbers.indexOf(correct)] };
}

function generateOddOneOut(challenge: Challenge): { grid: number[]; correctAnswers: number[] } {
  const { min_value, max_value } = challenge.rules;
  const used = new Set<number>();

  const majorityEven = Math.random() < 0.5;

  const majority: number[] = [];
  for (let i = 0; i < 8; i++) {
    let n: number;
    do {
      n = randInt(min_value, max_value);
    } while (used.has(n) || (majorityEven ? n % 2 !== 0 : n % 2 === 0));
    used.add(n);
    majority.push(n);
  }

  let oddOne: number;
  do {
    oddOne = randInt(min_value, max_value);
  } while (used.has(oddOne) || (majorityEven ? oddOne % 2 === 0 : oddOne % 2 !== 0));
  used.add(oddOne);

  const numbers = shuffleArray([oddOne, ...majority]);
  return { grid: numbers, correctAnswers: [numbers.indexOf(oddOne)] };
}

function generatePrime(challenge: Challenge): { grid: number[]; correctAnswers: number[] } {
  const { min_value, max_value } = challenge.rules;
  const used = new Set<number>();

  const primes: number[] = [];
  for (let n = Math.max(2, min_value); n <= max_value && primes.length < 50; n++) {
    if (isPrime(n)) primes.push(n);
  }
  if (primes.length === 0) throw new Error('No primes in range');

  const correct = primes[Math.floor(Math.random() * primes.length)];
  used.add(correct);

  const distractors: number[] = [];
  for (let i = 0; i < 8; i++) {
    let d: number;
    let attempts = 0;
    do {
      d = randInt(min_value, max_value);
      attempts++;
      if (attempts > 1000) break;
    } while (used.has(d) || isPrime(d));
    used.add(d);
    distractors.push(d);
  }

  const numbers = shuffleArray([correct, ...distractors]);
  return { grid: numbers, correctAnswers: [numbers.indexOf(correct)] };
}

const generators: Record<ChallengeType, (c: Challenge) => { grid: number[]; correctAnswers: number[] }> = {
  highest: generateHighest,
  lowest: generateLowest,
  closest: generateClosest,
  odd_one_out: generateOddOneOut,
  prime: generatePrime,
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateBoard(board: Board, challenge: Challenge): boolean {
  // Basic shape checks
  if (board.grid.length !== 9) return false;
  if (board.correct_answers.length !== 1) return false;
  if (new Set(board.grid).size !== 9) return false; // no duplicates

  const correctIdx = board.correct_answers[0];
  if (correctIdx < 0 || correctIdx >= 9) return false;
  const correctVal = board.grid[correctIdx];

  switch (board.type) {
    case 'highest':
      return board.grid.every((n) => n <= correctVal);
    case 'lowest':
      return board.grid.every((n) => n >= correctVal);
    case 'closest': {
      const target = challenge.rules.target_value!;
      const correctDist = Math.abs(correctVal - target);
      return board.grid.every((n, i) =>
        i === correctIdx || Math.abs(n - target) > correctDist,
      );
    }
    case 'odd_one_out': {
      const correctParity = correctVal % 2;
      const others = board.grid.filter((_, i) => i !== correctIdx);
      return others.every((n) => n % 2 !== correctParity);
    }
    case 'prime': {
      if (!isPrime(correctVal)) return false;
      return board.grid.every((n, i) => i === correctIdx || !isPrime(n));
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Solve-time heuristic & difficulty score
// ---------------------------------------------------------------------------

function estimateSolveTime(type: ChallengeType, difficulty: Difficulty): number {
  const base: Record<ChallengeType, number> = {
    highest: 1200,
    lowest: 1200,
    closest: 2000,
    odd_one_out: 2200,
    prime: 3000,
  };
  const multiplier: Record<Difficulty, number> = {
    easy: 0.8,
    medium: 1.0,
    hard: 1.3,
  };
  return Math.round(base[type] * multiplier[difficulty]);
}

function getDifficultyScore(type: ChallengeType, difficulty: Difficulty): number {
  const base: Record<ChallengeType, number> = {
    highest: 2,
    lowest: 2,
    closest: 5,
    odd_one_out: 5,
    prime: 8,
  };
  const offset: Record<Difficulty, number> = { easy: -1, medium: 0, hard: 1 };
  return Math.max(1, Math.min(10, base[type] + offset[difficulty]));
}

// ---------------------------------------------------------------------------
// Main generation
// ---------------------------------------------------------------------------

const BOARDS_PER_TEMPLATE = 10;
const MAX_RETRIES = 20; // attempts per board to pass validation

function generateBoards(challenges: Challenge[]): Board[] {
  const boards: Board[] = [];
  const seenGrids = new Set<string>(); // prevent duplicate grids

  for (const challenge of challenges) {
    const gen = generators[challenge.type];
    if (!gen) {
      console.warn(`Skipping unknown type: ${challenge.type}`);
      continue;
    }

    let generated = 0;
    for (let attempt = 0; attempt < BOARDS_PER_TEMPLATE * MAX_RETRIES && generated < BOARDS_PER_TEMPLATE; attempt++) {
      try {
        const { grid, correctAnswers } = gen(challenge);
        const gridKey = grid.join(',');
        if (seenGrids.has(gridKey)) continue;

        const board: Board = {
          id: `${challenge.id}_b${String(generated + 1).padStart(2, '0')}`,
          type: challenge.type,
          difficulty: challenge.difficulty,
          instruction: challenge.instruction,
          grid,
          correct_answers: correctAnswers,
          estimated_solve_time_ms: estimateSolveTime(challenge.type, challenge.difficulty),
          difficulty_score: getDifficultyScore(challenge.type, challenge.difficulty),
        };

        if (!validateBoard(board, challenge)) continue;

        seenGrids.add(gridKey);
        boards.push(board);
        generated++;
      } catch {
        // generation failed (e.g. range too narrow), skip
      }
    }

    if (generated < BOARDS_PER_TEMPLATE) {
      console.warn(`Only generated ${generated}/${BOARDS_PER_TEMPLATE} boards for ${challenge.id}`);
    }
  }

  return boards;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const root = path.resolve(__dirname, '..');
const challengesDir = path.join(root, 'assets', 'challenges');
const boardsDir = path.join(root, 'assets', 'boards');

if (!fs.existsSync(boardsDir)) {
  fs.mkdirSync(boardsDir, { recursive: true });
}

for (const tier of ['easy', 'medium', 'hard'] as const) {
  const challengePath = path.join(challengesDir, `${tier}.json`);
  const challenges: Challenge[] = JSON.parse(fs.readFileSync(challengePath, 'utf-8'));

  console.log(`\nGenerating ${tier} boards from ${challenges.length} templates...`);
  const boards = generateBoards(challenges);
  console.log(`  -> ${boards.length} boards generated`);

  // Shuffle to avoid predictable ordering
  shuffleArray(boards);

  const outPath = path.join(boardsDir, `${tier}.json`);
  fs.writeFileSync(outPath, JSON.stringify(boards, null, 2) + '\n');
  console.log(`  -> Written to ${outPath}`);
}

console.log('\nDone!');
