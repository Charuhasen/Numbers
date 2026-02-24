# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Role

You are a **senior React Native / Expo full-stack developer** building a production-grade mobile game. Every decision must prioritise scalability, testability, and App Store compliance. Think in terms of clean separation of concerns, server-authoritative security, and smooth 60fps performance. Read the design documents in `game-design/` before implementing any feature — they are the source of truth.

## Commands

```bash
npm install                             # Install dependencies
npx expo start                          # Start dev server (press i/a for iOS/Android)
npx expo start --ios                    # Run on iOS simulator
npx expo start --android                # Run on Android emulator
npx expo start --web                    # Run on web
npx expo lint                           # Run ESLint
npx expo export                         # Production web export
npx jest                                # Run all tests (when configured)
npx jest --watch                        # Run tests in watch mode
npx tsc --noEmit                        # TypeScript type checking
```

## Project Overview

TapTapMath is a React Native (Expo) mobile game where players solve number-based challenges on 3x3 grids under time pressure. Two game modes: **Classic** (endless, 3 hearts, progressive difficulty) and **Blitz** (60-second sprint, no hearts, no per-grid timer). Players earn bits (currency) from scores, collect consumable potions via drops, and compete on mode-specific leaderboards (best score per player). Targets iOS (App Store), Android (Play Store), and web.

**Current state:** Fresh Expo project (SDK 54) scaffolded from the default template. No game features implemented yet.

## Tech Stack

- **Framework:** Expo SDK 54, React Native 0.81.5, React 19.1
- **Language:** TypeScript (strict mode)
- **Routing:** expo-router v6 (file-based routing)
- **Navigation:** @react-navigation/native v7, @react-navigation/bottom-tabs v7
- **Animations:** react-native-reanimated v4
- **Haptics:** expo-haptics
- **Styling:** React Native StyleSheet (consider Nativewind if needed)
- **Backend:** Supabase (to be added — `@supabase/supabase-js`)
- **Linting:** ESLint with eslint-config-expo (flat config)
- **New Architecture:** Enabled
- **React Compiler:** Enabled (experimental)
- **Typed Routes:** Enabled (experimental)

## Project Structure

```
├── app/                    # Expo Router file-based routes
│   ├── _layout.tsx         # Root layout (Stack navigator + ThemeProvider)
│   ├── modal.tsx           # Modal screen
│   └── (tabs)/             # Tab navigator group
│       ├── _layout.tsx     # Tab layout
│       ├── index.tsx       # Home tab
│       └── explore.tsx     # Explore tab
│
├── components/             # Reusable UI components
│   ├── ui/                 # Base UI primitives
│   ├── themed-text.tsx     # Theme-aware Text
│   ├── themed-view.tsx     # Theme-aware View
│   ├── haptic-tab.tsx      # Tab bar button with haptics
│   ├── parallax-scroll-view.tsx
│   ├── hello-wave.tsx
│   └── external-link.tsx
│
├── constants/
│   └── theme.ts            # Color constants and theme values
│
├── hooks/                  # Custom React hooks
│   ├── use-color-scheme.ts
│   ├── use-color-scheme.web.ts
│   └── use-theme-color.ts
│
├── assets/
│   └── images/             # App icons, splash, etc.
│
├── game-design/            # Design documents (source of truth)
│   ├── high-level-design.md
│   ├── supabase-schema.md
│   ├── ui-design.md
│   └── UI/                 # UI reference assets
│
├── scripts/
│   └── reset-project.js
│
├── app.json                # Expo config
├── tsconfig.json           # TypeScript config (extends expo/tsconfig.base)
├── eslint.config.js        # ESLint flat config
└── package.json
```

### Path Aliases

TypeScript path alias `@/*` maps to the project root (e.g., `@/hooks/use-color-scheme`).

## Architecture Guidelines

### Routing — Expo Router (File-Based)

- Routes are defined by files in `app/`. Layouts use `_layout.tsx`.
- Route groups use `(groupName)/` directories.
- Use typed routes (enabled via `experiments.typedRoutes`).
- Auth guard should be implemented in the root layout or via a redirect in `_layout.tsx`.

### State Management

No state management library is installed yet. Recommended approach:
- Use React Context + `useReducer` for global app state (auth, user profile).
- Use local component state for UI-specific state.
- Game engine state should be managed via `useRef` + `useReducer` to avoid unnecessary re-renders during gameplay.
- Consider Zustand if global state needs grow complex.

### Component Patterns

- Prefer functional components with hooks.
- Use `React.memo` for expensive pure components (e.g., grid cells).
- Game timer should use `useRef` + `requestAnimationFrame` or `setInterval` with refs — never trigger re-renders per tick.
- Use `react-native-reanimated` for UI animations (shared values, animated styles).
- Use `expo-haptics` for tactile feedback: Light (tap), Medium (correct), Heavy (wrong/timeout).

### Import Conventions

- Use the `@/` path alias for all imports from project root.
- Group imports: React/RN first, then expo packages, then external libs, then local imports.

## Game Modes

| Mode | Hearts | Session | Timer | Potion Drops |
|---|---|---|---|---|
| Classic | 3 | Endless until death | Per-grid (6s→2s decay) | Yes |
| Blitz | None | 60-second global countdown | Global 60s only, no per-grid timer | No |

## Game Engine Rules (Critical)

The game engine should be a **pure TypeScript module** with zero React/React Native imports — fully unit testable.

### Core State

```typescript
GameState: hearts, challengeIndex, gridIndex (0-4), timeRemaining,
           globalTimeRemaining (Blitz only), currentChallenge, mode, score,
           bitsEarned, phase (playing/gameOver), potionEffects, events (GameEvent[])

GameEvent: type (correct/wrong/timeout/grid_skip), gridIndex, challengeIndex,
           timeRemaining, timestamp — recorded during play, sent to server at session end

ActivePotionEffects: secondChanceActive, timerFrozen, timerFreezeRemaining
```

### Gameplay Logic

| Event | Hearts | Grid | Score | Timer |
|---|---|---|---|---|
| Correct (Classic) | No change | Next grid | +100 + (timeRemaining * 10).round() | Reset to next grid's time |
| Correct (Blitz) | N/A | Next grid | +100 + (globalTimeRemaining * 10).round() | Global keeps counting down |
| Wrong answer | -1 (absorbed if Second Chance active) | Stay | No change | Keeps running |
| Timeout | -1 (Classic only) | Next grid | No change | Reset to next grid's time |
| Game over (0 hearts) | — | — | Final | — |

### Timer: `Math.max(6.0 - gridIndex * 1.0, 2.0)` seconds (Classic). Keeps running on wrong answer. Blitz uses global 60s only.

### App Lifecycle: Timer does NOT pause on app backgrounding. No save/restore on app kill. Prevents pause-abuse. Use `AppState` listener from React Native.

### Round = 1 Challenge (5 grids). Potion drops evaluated at round completion.

### Bits: `bitsEarned = Math.floor(finalScore / 100)`, credited at session end via RPC.

### Leaderboards: Best score per player per mode. Each player appears once.

### Difficulty Scaling (Classic): Challenges 1-5 Easy, 6-10 Easy+Medium, 11-15 Medium, 16-20 Medium+Hard, 21+ Hard. Number range and distractor closeness scale with tier.

## Challenge Types (6 Core)

| Type | Instruction | Difficulty |
|---|---|---|
| `highest` | Find the highest number | Easy |
| `lowest` | Find the lowest number | Easy |
| `closest` | Find the number closest to N | Medium |
| `odd_one_out` | Find the only odd/even number | Medium |
| `prime` | Find the prime number | Hard |
| `sum_to_n` | Find two numbers that sum to N | Hard (2 taps required) |

Grid: 3x3, 9 numbers, 1 correct + 8 plausible distractors. No duplicates.

### Board Generation Rules (Non-Negotiable)

Each board has 1 instruction and 5 grids. **Every grid must have exactly one correct answer that satisfies the instruction.** No grid may contain ambiguous answers (e.g., two numbers ending in 5 when the instruction is "Find the number ending in 5").

- Challenge rules are embedded directly in `scripts/generate-boards.ts` — no external template files.
- Boards are output per mode: `assets/boards/{classic,blitz}/{easy,medium,hard}.json`.
- The `validateBoard()` function in the generation script **must validate every challenge type**. When adding a new challenge type:
  1. Add a generator function that produces `{ grid, correctAnswers }`.
  2. Add a corresponding validation case in `validateBoard()` that verifies the correct answer is valid AND no other cell in the grid also satisfies the condition.
  3. Add the type to `estimateSolveTime()` and `getDifficultyScore()`.
- After generation, run the script and verify 0 warnings about under-generated boards.
- Run `npx tsc --noEmit` after regeneration to confirm type-check passes.

## Potion System

- **Pre-select up to 3 potions** via bottom sheet before starting a game. Tap mode → bottom sheet with inventory + 3 slots → confirm to start.
- **Auto-triggered (passive):** Second Chance (absorbs 1 wrong tap).
- **Manual activation (active):** Time Freeze (pause 5s), 50/50 (remove 4 wrong), Grid Skip (auto-solve for full points), Scanner (highlight answer 3s, timer keeps running), Heart Refill (+1, max 4).
- Only one manual potion active at a time. Cannot swap mid-game.
- **Drops:** 20% per completed round. Guaranteed at milestone rounds (5, 10, 15...). Rarity scales: Rounds 1-10 mostly Rare, 11-20 mostly Epic, 21+ significant Legendary. No drops in Blitz.

## Supabase Backend

### Tables: `profiles`, `scores`, `inventory`, `challenges`, `store_items`, `transactions`

### Security — Server-Authoritative (Non-Negotiable)

- **RLS is mandatory on every table.** Never disable it.
- **Session tokens:** Call `start_game_session(mode)` RPC before each game starts. Returns a one-time `session_id` UUID stored in a ref. Passed to `submit_game_score` at session end. Server validates: session belongs to user, not yet submitted, minimum 5 s elapsed. Rate-limited to 3 unsubmitted sessions per 10 minutes. Offline games pass `session_id: null` — score still submits but without timing validation.
- **Scores:** No direct client insert. `submit_game_score` RPC replays game events server-side to calculate score. Also validates `time_remaining` bounds (0–10 s) and correct-event count against `round_reached`. Prevents fake scores.
- **Currency (bits):** Protected by RLS check constraint on `profiles`. Only mutated via RPC.
- **Inventory:** No direct client update. All mutations via RPC (`grant_potion_drop`, `consume_potion`, `purchase_item_with_bits`).
- **Purchases:** `purchase_item_with_bits` uses `SELECT ... FOR UPDATE` to prevent double-spend.
- **Transactions table:** Append-only audit log for all currency/inventory mutations.
- **Leaderboards:** `get_leaderboard` RPC returns best score per player using `DISTINCT ON`.
- **Account deletion:** `delete_own_account` RPC + Supabase Edge Function (required for Apple App Store compliance).
- `handle_new_user` trigger auto-creates `profiles` + `inventory` on signup.

### RPC Functions (8): `start_game_session`, `submit_game_score`, `purchase_item_with_bits`, `grant_potion_drop`, `consume_potion`, `get_leaderboard`, `handle_new_user` (trigger), `delete_own_account`

### Auth Flow

- Google OAuth + Apple Sign-In (Apple mandatory for iOS App Store).
- Use `@supabase/supabase-js` with `expo-auth-session` or `expo-web-browser` for OAuth.
- Silent re-login on app open. Auth guard in root layout.
- Country captured once from device locale.
- Account deletion available in Profile screen (Apple requirement).

## Offline Support

- Fixed challenges always available offline.
- AI challenges require network.
- Scores and potion drops earned offline are queued locally and synced on reconnect via RPC.
- Store purchases require network.
- Conflict resolution: server state is authoritative. Client sends deltas, server applies.

## Routing Plan

Using expo-router file-based routing:

```
app/
├── _layout.tsx              # Root Stack (ThemeProvider, auth check)
├── (auth)/
│   ├── _layout.tsx
│   └── sign-in.tsx          # Auth screen (Apple + Google)
├── (tabs)/
│   ├── _layout.tsx          # Bottom tab navigator
│   ├── index.tsx            # Home (mode selection)
│   ├── leaderboard.tsx      # Leaderboards
│   ├── store.tsx            # Store
│   └── profile.tsx          # Profile + settings + account deletion
├── game/
│   ├── _layout.tsx
│   ├── [mode].tsx           # Game screen (classic/blitz)
│   └── game-over.tsx        # Game over screen
└── modal.tsx                # Reusable modal
```

Auth redirect guard in root `_layout.tsx`. Potion selection via bottom sheet modal before game start.

## UI — Game Screen Layout

```
[ Hearts ] [ Timer Bar ] [ Score ]
     [ Instruction Text ]
       [ 3x3 Grid ]
 [ Potion ] [ Potion ] [ Potion ]
```

- Grid component: stateless, receives numbers + callback, zero logic.
- Timer: `useRef` + `requestAnimationFrame`, update animated value via Reanimated — no `setState` per tick.
- Haptics: Light (tap), Medium (correct), Heavy (wrong/timeout) via `expo-haptics`.
- Audio: Tick-tock (last 3s), success chime, error buzz, level complete jingle. Use `expo-av` (to be added). Preloaded at app start.

## Performance Requirements

- No component re-renders during timer ticks. Use Reanimated shared values.
- Preload all assets during splash screen.
- Use `React.memo` for grid cells and static UI.
- Audio instances pre-warmed.
- Use `InteractionManager.runAfterInteractions` for deferred work after navigation.

## Testing Strategy

- **Unit tests (mandatory, pure TypeScript):** Game engine, timer logic, grid generation, scoring (Classic + Blitz formulas), all 8 potions, drop logic, bits calculation, difficulty tiers, game event recording.
- **Component tests:** Grid taps (including sum_to_n two-tap), timer expiry, hearts, potion tray, potion selection bottom sheet, navigation.
- **E2E tests:** Full game session, auth flow, offline→online sync, account deletion (Detox or Maestro).

## Design Documents

Always consult these before implementing:

- `game-design/high-level-design.md` — Complete architecture, game rules, 2 modes (Classic + Blitz), scoring, 6 challenge types with JSON format, potion system, difficulty tiers, app lifecycle, offline support, error handling, account deletion
- `game-design/supabase-schema.md` — 6 tables, RLS policies, 7 RPC functions, security model summary
- `game-design/ui-design.md` — UI design specifications
- `game-design/UI/` — UI reference assets
