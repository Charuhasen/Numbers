#!/usr/bin/env node
/**
 * fix-easy-boards.mjs
 *
 * For boards whose instructions match:
 *   - "Find a multiple of X"
 *   - "Find an odd number" / "Find an even number"
 *   - "Find a number divisible by X"
 *
 * Ensures EVERY number in every grid is in the range [1, 50].
 * Grids are fully regenerated: 1 correct value + 8 distractors, all ≤ 50.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EASY_PATH = path.join(__dirname, '..', 'assets', 'boards', 'classic', 'easy.json');

const MAX_VAL = 50;

// ── Board type filter ────────────────────────────────────────────────────────

function needsFix(instruction) {
    const lower = instruction.toLowerCase();
    if (/^find a multiple of \d+$/.test(lower)) return true;
    if (/^find a number divisible by \d+$/.test(lower)) return true;
    if (/^find an? (odd|even) number$/.test(lower)) return true;
    return false;
}

// ── Condition checker ────────────────────────────────────────────────────────

function satisfies(num, instruction) {
    const lower = instruction.toLowerCase();
    if (/odd number/.test(lower)) return num % 2 !== 0;
    if (/even number/.test(lower)) return num % 2 === 0;
    const m = instruction.match(/(?:multiple of|divisible by)\s+(\d+)/i);
    if (m) return num % parseInt(m[1], 10) === 0;
    return false;
}

// ── Pool builders (all ≤ MAX_VAL, no 0) ────────────────────────────────────

function correctPool(instruction) {
    const pool = [];
    for (let v = 1; v <= MAX_VAL; v++) {
        if (satisfies(v, instruction)) pool.push(v);
    }
    return pool;
}

function distractorPool(instruction) {
    const pool = [];
    for (let v = 1; v <= MAX_VAL; v++) {
        if (!satisfies(v, instruction)) pool.push(v);
    }
    return pool;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function pick(arr, n) {
    return shuffle(arr).slice(0, n);
}

// ── Grid regenerator ─────────────────────────────────────────────────────────

/**
 * Returns a fully regenerated { grid, correct_answers } where every value
 * is in [1, MAX_VAL]. Generates a fresh grid per call so each grid in a
 * board is unique.
 */
function regenGrid(instruction) {
    const cp = correctPool(instruction);
    const dp = distractorPool(instruction);

    if (cp.length === 0 || dp.length < 8) {
        throw new Error(`Not enough pool values for: "${instruction}"`);
    }

    // Pick 1 correct + 8 distractors (no repeats across the 9 cells)
    const correctVal = pick(cp, 1)[0];
    const distractors = pick(dp, 8);

    // Arrange into a 9-cell grid with the correct value at a random index
    const cells = [...distractors];
    const correctPos = Math.floor(Math.random() * 9);
    cells.splice(correctPos, 0, correctVal); // insert at random position

    return { grid: cells.slice(0, 9), correct_answers: [correctPos] };
}

/** Returns true if every value in the grid is already within [1, MAX_VAL] */
function gridIsClean(grid) {
    return grid.every(v => v >= 1 && v <= MAX_VAL);
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('📖  Reading easy.json …');
const raw = fs.readFileSync(EASY_PATH, 'utf-8');
const boards = JSON.parse(raw);

let boardsFixed = 0;
let gridsFixed = 0;

for (const board of boards) {
    if (!needsFix(board.instruction)) continue;

    let boardModified = false;

    for (let gi = 0; gi < board.grids.length; gi++) {
        const entry = board.grids[gi];

        // Regenerate if ANY number in the grid exceeds MAX_VAL
        if (!gridIsClean(entry.grid)) {
            board.grids[gi] = regenGrid(board.instruction);
            gridsFixed++;
            boardModified = true;
        }
    }

    if (boardModified) {
        boardsFixed++;
        console.log(`  ✅  Fixed: ${board.id}`);
    }
}

console.log(`\n✨  Done. ${boardsFixed} boards, ${gridsFixed} grids regenerated.`);
fs.writeFileSync(EASY_PATH, JSON.stringify(boards, null, 2), 'utf-8');
console.log('💾  easy.json saved.');
