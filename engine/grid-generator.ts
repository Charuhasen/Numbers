import { Challenge, Grid } from './types';

/** Fisher-Yates shuffle (in-place, returns same array) */
function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Check if a number is prime */
function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

/** Generate a random integer in [min, max] */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Generate a unique random integer not in the exclude set */
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

function generateHighest(challenge: Challenge): Grid {
  const { min_value, max_value, distractor_min_delta, distractor_max_delta } = challenge.rules;
  const used = new Set<number>();

  // Correct answer: in the upper range
  const correctMin = Math.floor(max_value * 0.7);
  const correct = randInt(correctMin, max_value);
  used.add(correct);

  // 8 distractors, all lower than correct
  const distractors: number[] = [];
  const distLow = Math.max(min_value, correct - distractor_max_delta);
  const distHigh = Math.max(distLow, correct - distractor_min_delta);
  for (let i = 0; i < 8; i++) {
    const d = randIntExcluding(distLow, distHigh, used);
    used.add(d);
    distractors.push(d);
  }

  const numbers = shuffleArray([correct, ...distractors]);
  const correctIndices = [numbers.indexOf(correct)];

  return { numbers, correctIndices, challenge };
}

function generateLowest(challenge: Challenge): Grid {
  const { min_value, max_value, distractor_min_delta, distractor_max_delta } = challenge.rules;
  const used = new Set<number>();

  // Correct answer: in the lower range
  const correctMax = Math.floor(min_value + (max_value - min_value) * 0.3);
  const correct = randInt(min_value, correctMax);
  used.add(correct);

  // 8 distractors, all higher than correct
  const distractors: number[] = [];
  const distLow = correct + distractor_min_delta;
  const distHigh = Math.min(max_value, correct + distractor_max_delta);
  for (let i = 0; i < 8; i++) {
    const d = randIntExcluding(distLow, distHigh, used);
    used.add(d);
    distractors.push(d);
  }

  const numbers = shuffleArray([correct, ...distractors]);
  const correctIndices = [numbers.indexOf(correct)];

  return { numbers, correctIndices, challenge };
}

function generateClosest(challenge: Challenge): Grid {
  const { min_value, max_value, distractor_min_delta, distractor_max_delta, target_value } = challenge.rules;
  if (target_value === undefined) throw new Error('closest requires target_value');

  const used = new Set<number>();

  // Correct: very close to target (within delta range, or the target itself)
  const closeDelta = Math.max(1, Math.floor(distractor_min_delta / 2));
  let correct: number;
  if (!used.has(target_value) && target_value >= min_value && target_value <= max_value) {
    correct = target_value;
  } else {
    correct = randInt(
      Math.max(min_value, target_value - closeDelta),
      Math.min(max_value, target_value + closeDelta),
    );
  }
  used.add(correct);
  const correctDist = Math.abs(correct - target_value);

  // 8 distractors: further from target than correct
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
  const correctIndices = [numbers.indexOf(correct)];

  return { numbers, correctIndices, challenge };
}

function generateOddOneOut(challenge: Challenge): Grid {
  const { min_value, max_value } = challenge.rules;
  const used = new Set<number>();

  // Decide majority parity
  const majorityEven = Math.random() < 0.5;

  // 8 numbers of majority parity
  const majority: number[] = [];
  for (let i = 0; i < 8; i++) {
    let n: number;
    do {
      n = randInt(min_value, max_value);
    } while (used.has(n) || (majorityEven ? n % 2 !== 0 : n % 2 === 0));
    used.add(n);
    majority.push(n);
  }

  // 1 odd-one-out (opposite parity)
  let oddOne: number;
  do {
    oddOne = randInt(min_value, max_value);
  } while (used.has(oddOne) || (majorityEven ? oddOne % 2 === 0 : oddOne % 2 !== 0));
  used.add(oddOne);

  const numbers = shuffleArray([oddOne, ...majority]);
  const correctIndices = [numbers.indexOf(oddOne)];

  return { numbers, correctIndices, challenge };
}

function generatePrime(challenge: Challenge): Grid {
  const { min_value, max_value } = challenge.rules;
  const used = new Set<number>();

  // Find a prime in range
  const primes: number[] = [];
  for (let n = Math.max(2, min_value); n <= max_value && primes.length < 50; n++) {
    if (isPrime(n)) primes.push(n);
  }
  if (primes.length === 0) throw new Error('No primes in range');

  const correct = primes[Math.floor(Math.random() * primes.length)];
  used.add(correct);

  // 8 composite distractors
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
  const correctIndices = [numbers.indexOf(correct)];

  return { numbers, correctIndices, challenge };
}

const generators: Record<string, (c: Challenge) => Grid> = {
  highest: generateHighest,
  lowest: generateLowest,
  closest: generateClosest,
  odd_one_out: generateOddOneOut,
  prime: generatePrime,
};

export function generateGrid(challenge: Challenge): Grid {
  const gen = generators[challenge.type];
  if (!gen) throw new Error(`Unknown challenge type: ${challenge.type}`);
  return gen(challenge);
}
