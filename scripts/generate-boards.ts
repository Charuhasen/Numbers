/**
 * Board generation script.
 * Challenge rules are embedded directly — no external template files needed.
 * Generates boards per mode: assets/boards/{classic,blitz,daily}/{easy,medium,hard}.json
 *
 * Each mode gets the same board content but with an independent shuffle,
 * so players can't memorize board order across modes.
 *
 * Usage: npx tsx scripts/generate-boards.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types (mirrored from engine/types.ts to keep script self-contained)
// ---------------------------------------------------------------------------

type ChallengeType =
  | 'highest'
  | 'lowest'
  | 'closest'
  | 'odd_one_out'
  | 'prime'
  | 'match'
  | 'property';
type Difficulty = 'easy' | 'medium' | 'hard';
type GameMode = 'classic' | 'blitz' | 'daily';

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
  grids: {
    grid: number[];
    correct_answers: number[];
  }[];
  estimated_solve_time_ms: number;
  difficulty_score: number;
}

// ---------------------------------------------------------------------------
// Embedded challenge templates (previously in assets/challenges/*.json)
// ---------------------------------------------------------------------------

const CHALLENGE_TEMPLATES: Record<Difficulty, Challenge[]> = {
  easy: [
    { id: 'easy_highest_1', instruction: 'Find the highest number', type: 'highest', difficulty: 'easy', rules: { min_value: 1, max_value: 50, distractor_min_delta: 10, distractor_max_delta: 30, required_selections: 1 } },
    { id: 'easy_lowest_1', instruction: 'Find the lowest number', type: 'lowest', difficulty: 'easy', rules: { min_value: 1, max_value: 50, distractor_min_delta: 10, distractor_max_delta: 30, required_selections: 1 } },
    { id: 'easy_match_1', instruction: 'Find the number 7', type: 'match', difficulty: 'easy', rules: { min_value: 1, max_value: 100, distractor_min_delta: 0, distractor_max_delta: 0, target_value: 7, required_selections: 1 } },
    { id: 'easy_match_2', instruction: 'Find the number 42', type: 'match', difficulty: 'easy', rules: { min_value: 1, max_value: 100, distractor_min_delta: 0, distractor_max_delta: 0, target_value: 42, required_selections: 1 } },
    { id: 'easy_prop_0', instruction: 'Find the number ending in 0', type: 'property', difficulty: 'easy', rules: { min_value: 1, max_value: 100, distractor_min_delta: 0, distractor_max_delta: 0, target_value: 0, required_selections: 1 } },
    { id: 'easy_prop_5', instruction: 'Find the number ending in 5', type: 'property', difficulty: 'easy', rules: { min_value: 1, max_value: 100, distractor_min_delta: 0, distractor_max_delta: 0, target_value: 5, required_selections: 1 } },
    { id: 'easy_prop_single', instruction: 'Find the single-digit number', type: 'property', difficulty: 'easy', rules: { min_value: 1, max_value: 100, distractor_min_delta: 0, distractor_max_delta: 0, target_value: 10, required_selections: 1 } },
    { id: 'easy_prop_double', instruction: 'Find the two-digit number', type: 'property', difficulty: 'easy', rules: { min_value: 1, max_value: 100, distractor_min_delta: 0, distractor_max_delta: 0, target_value: 11, required_selections: 1 } },
    { id: 'easy_odd', instruction: 'Find the odd one out', type: 'odd_one_out', difficulty: 'easy', rules: { min_value: 1, max_value: 50, distractor_min_delta: 0, distractor_max_delta: 0, required_selections: 1 } },
    { id: 'easy_greatest', instruction: 'Find the greatest number', type: 'highest', difficulty: 'easy', rules: { min_value: 1, max_value: 80, distractor_min_delta: 10, distractor_max_delta: 30, required_selections: 1 } },
    { id: 'easy_smallest', instruction: 'Find the smallest number', type: 'lowest', difficulty: 'easy', rules: { min_value: 1, max_value: 80, distractor_min_delta: 10, distractor_max_delta: 30, required_selections: 1 } },
  ],
  medium: [
    { id: 'med_closest_1', instruction: 'Find the number closest to 50', type: 'closest', difficulty: 'medium', rules: { min_value: 1, max_value: 100, distractor_min_delta: 8, distractor_max_delta: 30, target_value: 50, required_selections: 1 } },
    { id: 'med_closest_2', instruction: 'Find the number closest to 75', type: 'closest', difficulty: 'medium', rules: { min_value: 20, max_value: 130, distractor_min_delta: 10, distractor_max_delta: 40, target_value: 75, required_selections: 1 } },
    { id: 'med_closest_3', instruction: 'Find the number closest to 100', type: 'closest', difficulty: 'medium', rules: { min_value: 40, max_value: 160, distractor_min_delta: 10, distractor_max_delta: 45, target_value: 100, required_selections: 1 } },
    { id: 'med_closest_4', instruction: 'Find the number closest to 150', type: 'closest', difficulty: 'medium', rules: { min_value: 80, max_value: 220, distractor_min_delta: 12, distractor_max_delta: 50, target_value: 150, required_selections: 1 } },
    { id: 'med_closest_5', instruction: 'Find the number closest to 175', type: 'closest', difficulty: 'medium', rules: { min_value: 100, max_value: 250, distractor_min_delta: 12, distractor_max_delta: 55, target_value: 175, required_selections: 1 } },
    { id: 'med_odd_1', instruction: 'Find the odd one out', type: 'odd_one_out', difficulty: 'medium', rules: { min_value: 1, max_value: 100, distractor_min_delta: 3, distractor_max_delta: 8, required_selections: 1 } },
    { id: 'med_odd_2', instruction: 'Find the odd one out', type: 'odd_one_out', difficulty: 'medium', rules: { min_value: 1, max_value: 120, distractor_min_delta: 3, distractor_max_delta: 8, required_selections: 1 } },
    { id: 'med_odd_3', instruction: 'Find the odd one out', type: 'odd_one_out', difficulty: 'medium', rules: { min_value: 10, max_value: 150, distractor_min_delta: 4, distractor_max_delta: 8, required_selections: 1 } },
    { id: 'med_odd_4', instruction: 'Find the odd one out', type: 'odd_one_out', difficulty: 'medium', rules: { min_value: 1, max_value: 180, distractor_min_delta: 3, distractor_max_delta: 8, required_selections: 1 } },
    { id: 'med_odd_5', instruction: 'Find the odd one out', type: 'odd_one_out', difficulty: 'medium', rules: { min_value: 5, max_value: 200, distractor_min_delta: 3, distractor_max_delta: 8, required_selections: 1 } },
  ],
  hard: [
    { id: 'hard_prime_1', instruction: 'Find the prime number', type: 'prime', difficulty: 'hard', rules: { min_value: 2, max_value: 100, distractor_min_delta: 1, distractor_max_delta: 3, required_selections: 1 } },
    { id: 'hard_prime_2', instruction: 'Find the prime number', type: 'prime', difficulty: 'hard', rules: { min_value: 10, max_value: 200, distractor_min_delta: 1, distractor_max_delta: 3, required_selections: 1 } },
    { id: 'hard_prime_3', instruction: 'Find the prime number', type: 'prime', difficulty: 'hard', rules: { min_value: 50, max_value: 500, distractor_min_delta: 1, distractor_max_delta: 3, required_selections: 1 } },
    { id: 'hard_prime_4', instruction: 'Find the prime number', type: 'prime', difficulty: 'hard', rules: { min_value: 100, max_value: 750, distractor_min_delta: 1, distractor_max_delta: 3, required_selections: 1 } },
    { id: 'hard_prime_5', instruction: 'Find the prime number', type: 'prime', difficulty: 'hard', rules: { min_value: 200, max_value: 1000, distractor_min_delta: 1, distractor_max_delta: 3, required_selections: 1 } },
  ],
};

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

const generators: Record<
  ChallengeType,
  (c: Challenge) => { grid: number[]; correctAnswers: number[] }
> = {
  highest: generateHighest,
  lowest: generateLowest,
  closest: generateClosest,
  odd_one_out: generateOddOneOut,
  prime: generatePrime,
  match: (c) => {
    const target = c.rules.target_value ?? randInt(1, 100);
    const nums = [target];
    while (nums.length < 9) {
      const n = randInt(1, 100);
      if (!nums.includes(n)) nums.push(n);
    }
    shuffleArray(nums);
    return { grid: nums, correctAnswers: [nums.indexOf(target)] };
  },
  property: (c) => {
    const targetVal = c.rules.target_value ?? 0;
    const used = new Set<number>();
    let correct: number;

    if (targetVal === 10) {
      // Find the single-digit number
      correct = randInt(1, 9);
      used.add(correct);
      const distractors: number[] = [];
      while (distractors.length < 8) {
        const d = randInt(10, 99);
        if (!used.has(d)) {
          used.add(d);
          distractors.push(d);
        }
      }
      const grid = shuffleArray([correct, ...distractors]);
      return { grid, correctAnswers: [grid.indexOf(correct)] };
    } else if (targetVal === 11) {
      // Find the two-digit number
      correct = randInt(10, 99);
      used.add(correct);
      const distractors: number[] = [];
      while (distractors.length < 8) {
        const d = randInt(1, 9);
        if (!used.has(d)) {
          used.add(d);
          distractors.push(d);
        }
      }
      const grid = shuffleArray([correct, ...distractors]);
      return { grid, correctAnswers: [grid.indexOf(correct)] };
    } else {
      // Find the number ending in targetVal (0 or 5)
      const digit = targetVal;
      const valid = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
        .map((n) => n * 10 + digit)
        .filter((n) => n > 0);
      correct = valid[randInt(0, valid.length - 1)];
      used.add(correct);
      const distractors: number[] = [];
      while (distractors.length < 8) {
        const d = randInt(1, 100);
        if (d % 10 !== digit && !used.has(d)) {
          used.add(d);
          distractors.push(d);
        }
      }
      const grid = shuffleArray([correct, ...distractors]);
      return { grid, correctAnswers: [grid.indexOf(correct)] };
    }
  },
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateBoard(board: Board, challenge: Challenge): boolean {
  if (board.grids.length !== 5) return false;

  for (const entry of board.grids) {
    const { grid, correct_answers } = entry;
    // Basic shape checks
    if (grid.length !== 9) return false;
    if (correct_answers.length !== 1) return false;
    if (new Set(grid).size !== 9) return false; // no duplicates

    const correctIdx = correct_answers[0];
    if (correctIdx < 0 || correctIdx >= 9) return false;
    const correctVal = grid[correctIdx];

    switch (board.type) {
      case 'highest':
        if (!grid.every((n) => n <= correctVal)) return false;
        break;
      case 'lowest':
        if (!grid.every((n) => n >= correctVal)) return false;
        break;
      case 'closest': {
        const target = challenge.rules.target_value!;
        const correctDist = Math.abs(correctVal - target);
        if (
          !grid.every(
            (n, i) => i === correctIdx || Math.abs(n - target) > correctDist,
          )
        )
          return false;
        break;
      }
      case 'odd_one_out': {
        const correctParity = correctVal % 2;
        const others = grid.filter((_, i) => i !== correctIdx);
        if (!others.every((n) => n % 2 !== correctParity)) return false;
        break;
      }
      case 'prime': {
        if (!isPrime(correctVal)) return false;
        if (!grid.every((n, i) => i === correctIdx || !isPrime(n))) return false;
        break;
      }
    }
  }

  return true;
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
    match: 1000,
    property: 1500,
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
    match: 1,
    property: 2,
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
        const grids: { grid: number[]; correct_answers: number[] }[] = [];
        for (let g = 0; g < 5; g++) {
          const { grid, correctAnswers } = gen(challenge);
          grids.push({ grid, correct_answers: correctAnswers });
        }

        const board: Board = {
          id: `${challenge.id}_b${String(generated + 1).padStart(2, '0')}`,
          type: challenge.type,
          difficulty: challenge.difficulty,
          instruction: challenge.instruction,
          grids,
          estimated_solve_time_ms: estimateSolveTime(
            challenge.type,
            challenge.difficulty,
          ),
          difficulty_score: getDifficultyScore(
            challenge.type,
            challenge.difficulty,
          ),
        };

        if (!validateBoard(board, challenge)) continue;

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
// Run — generate per mode with independent shuffles
// ---------------------------------------------------------------------------

const MODES: GameMode[] = ['classic', 'blitz', 'daily'];
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

const root = path.resolve(__dirname, '..');
const boardsDir = path.join(root, 'assets', 'boards');

// Generate boards once per difficulty (shared across modes)
const boardsByDifficulty: Record<Difficulty, Board[]> = {} as Record<Difficulty, Board[]>;

for (const tier of DIFFICULTIES) {
  const challenges = CHALLENGE_TEMPLATES[tier];
  console.log(`\nGenerating ${tier} boards from ${challenges.length} templates...`);
  const boards = generateBoards(challenges);
  console.log(`  -> ${boards.length} boards generated`);
  boardsByDifficulty[tier] = boards;
}

// Write per-mode directories with independent shuffles
for (const mode of MODES) {
  const modeDir = path.join(boardsDir, mode);
  if (!fs.existsSync(modeDir)) {
    fs.mkdirSync(modeDir, { recursive: true });
  }

  for (const tier of DIFFICULTIES) {
    // Deep copy and independently shuffle for this mode
    const boards = boardsByDifficulty[tier].map((b) => ({ ...b }));
    shuffleArray(boards);

    const outPath = path.join(modeDir, `${tier}.json`);
    fs.writeFileSync(outPath, JSON.stringify(boards, null, 2) + '\n');
    console.log(`  -> Written ${mode}/${tier}.json (${boards.length} boards)`);
  }
}

console.log('\nDone!');
