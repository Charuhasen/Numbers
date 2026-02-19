/**
 * Adds instruction_complexity_index and time_allowed_ms to every board
 * in assets/boards/classic/questions.json, inserted directly after "instruction".
 *
 * Scoring model
 * ─────────────
 * Base rule cost
 *   simple comparison (>, <, =)          : +2
 *   even / odd property                  : +3
 *   ends with / starts with digit        : +3
 *   contains digit                       : +4
 *   range (between X and Y)              : +4
 *   divisibility (multiple of X)         : +5
 *   arithmetic evaluation (X × Y, X ÷ Y): +5
 *   multi-step (highest, lowest, closest,
 *               prime, second highest…)  : +6
 *
 * Visual scan cost (fixed 3×3 grid): +2
 *
 * Distractor sensitivity
 *   clear threshold, low ambiguity       : +1
 *   high near-miss potential             : +2
 *
 * time_allowed_ms = round(3000 * (1 + (index - 5) * 0.07))
 * clamped to [2000, 5500]
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, '../assets/boards/classic/questions.json');

// ─── Scoring ────────────────────────────────────────────────────────────────

function computeComplexityIndex(instruction) {
  const t = instruction.toLowerCase();

  // ── Base rule cost ──────────────────────────────────────────────────────
  let base;

  if (
    /\b(closest|nearest to|second\s+highest|second\s+lowest|second\s+largest|second\s+smallest)\b/.test(t) ||
    /\bprime\b/.test(t)
  ) {
    base = 6; // multi-step reasoning
  } else if (/\b(highest|lowest|largest|smallest|biggest|greatest)\b/.test(t)) {
    base = 6; // global comparison across all cells
  } else if (/\b(multiple of|divisible by)\b/.test(t)) {
    base = 5; // divisibility
  } else if (/\d\s*[×x*]\s*\d|\d\s*[÷/]\s*\d/.test(t)) {
    base = 5; // arithmetic expression
  } else if (/\bbetween\b/.test(t)) {
    base = 4; // range condition
  } else if (/\bcontains?\b/.test(t)) {
    base = 4; // contains a specific digit
  } else if (/\b(ends?\s+with|starts?\s+with|begins?\s+with)\b/.test(t)) {
    base = 3; // digit position property
  } else if (/\b(even|odd)\b/.test(t)) {
    base = 3; // parity property
  } else {
    // simple comparison: greater than, less than, equal to, above, below, over, under, more than, fewer than
    base = 2;
  }

  // ── Visual scan cost (3×3 grid, fixed) ──────────────────────────────────
  const scan = 2;

  // ── Distractor sensitivity ───────────────────────────────────────────────
  let distractor;

  if (
    /\b(closest|nearest|prime|second)\b/.test(t) ||  // requires comparing all cells
    /\b(highest|lowest|largest|smallest|biggest|greatest)\b/.test(t) || // relative extremes
    /\bbetween\b/.test(t) ||                          // range boundaries are near-miss traps
    /\bcontains?\b/.test(t)                           // multiple cells may contain the digit
  ) {
    distractor = 2;
  } else {
    distractor = 1; // clear threshold, low ambiguity
  }

  return base + scan + distractor;
}

function computeTimeAllowed(index) {
  const raw = Math.round(3000 * (1 + (index - 5) * 0.07));
  return Math.min(5500, Math.max(2000, raw));
}

// ─── Process ────────────────────────────────────────────────────────────────

const boards = JSON.parse(readFileSync(FILE, 'utf8'));

const updated = boards.map((board) => {
  const result = {};
  for (const [key, value] of Object.entries(board)) {
    result[key] = value;
    if (key === 'instruction') {
      const idx = computeComplexityIndex(board.instruction);
      result.instruction_complexity_index = idx;
      result.time_allowed_ms = computeTimeAllowed(idx);
    }
  }
  return result;
});

writeFileSync(FILE, JSON.stringify(updated, null, 2));
console.log(`✓ Processed ${updated.length} boards`);

// ── Sanity check: print unique (instruction pattern → index) pairs ──────────
const seen = new Map();
for (const b of updated) {
  const key = `[base via "${b.instruction.toLowerCase().slice(0, 60)}"] → idx=${b.instruction_complexity_index} time=${b.time_allowed_ms}ms`;
  if (!seen.has(b.instruction_complexity_index)) {
    seen.set(b.instruction_complexity_index, key);
  }
}
console.log('\nSample index assignments:');
for (const [, label] of [...seen.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(' ', label);
}
