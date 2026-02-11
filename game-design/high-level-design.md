# Numbers Game — High-Level Design

Complete, implementation-grade breakdown for building this mobile application in **Flutter**. Covers architecture, state management, screens, game engine design, Supabase integration, AI integration, performance, and scalability.

---

# 1. High-Level Architecture

### 1.1 Architectural Pattern

**Clean Architecture + Feature-First Modularisation**

This is critical because:

* Game logic must be deterministic and testable
* UI must be lightweight and reactive
* Supabase & AI must be swappable without refactors

```
lib/
 ├── core/
 ├── features/
 ├── shared/
 └── main.dart
```

---

# 2. Tech Stack (Flutter)

### 2.1 Core

* Flutter (latest stable)
* Dart 3+
* Material 3 (with custom theming)

### 2.2 State Management

**Riverpod (preferred)**

* Predictable state
* Excellent async handling
* Testable game engine
* No widget rebuild abuse

### 2.3 Routing

**GoRouter** for declarative navigation. Supports deep linking and auth redirects.

---

# 3. Folder Structure (Final)

```text
lib/
 ├── core/
 │   ├── constants/
 │   ├── theme/
 │   ├── utils/
 │   └── services/
 │
 ├── features/
 │   ├── auth/
 │   │   ├── data/
 │   │   ├── domain/
 │   │   └── presentation/
 │   │
 │   ├── game/
 │   │   ├── data/
 │   │   ├── domain/
 │   │   ├── engine/
 │   │   └── presentation/
 │   │
 │   ├── leaderboard/
 │   │   ├── data/
 │   │   ├── domain/
 │   │   └── presentation/
 │   │
 │   ├── store/
 │   │   ├── data/
 │   │   ├── domain/
 │   │   └── presentation/
 │   │
 │   └── profile/
 │       ├── data/
 │       ├── domain/
 │       └── presentation/
 │
 ├── shared/
 │   ├── widgets/
 │   └── models/
 │
 └── main.dart
```

---

# 4. Core Game Design in Flutter

## 4.1 Game Engine (Non-UI)

This is the **most important part**.

### Responsibilities

* Round lifecycle
* Challenge sequencing
* Sub-round timing
* Heart management
* Scoring
* Difficulty scaling
* Potion effect tracking

**Never mix UI with game logic.**

### Engine Location

```
features/game/engine/game_engine.dart
```

### Core State Model

```dart
class GameState {
  final int hearts;              // Starts at 3, max 3 (unless Heart Refill potion adds +1)
  final int challengeIndex;      // Current challenge number (0-based, increments indefinitely in Classic)
  final int gridIndex;           // Current grid within a challenge (0-4)
  final double timeRemaining;
  final double? globalTimeRemaining; // Blitz only: 60s countdown. Null for other modes.
  final Challenge currentChallenge;
  final GameMode mode;
  final int score;
  final int bitsEarned;          // Running bits total for this session (score / 10)
  final GamePhase phase;         // playing, gameOver
  final ActivePotionEffects potionEffects;  // Currently active potion state
  final List<GameEvent> events;  // Recorded for server-side score validation
}

enum GamePhase { playing, gameOver }

enum GameMode { classic, blitz, daily }

/// Recorded during gameplay, sent to submit_game_score RPC at session end.
class GameEvent {
  final String type;             // 'correct', 'wrong', 'timeout', 'grid_skip'
  final int gridIndex;           // 0-4
  final int challengeIndex;
  final double? timeRemaining;   // Remaining time at event (null for timeout)
  final DateTime timestamp;
}
```

### Active Potion Effects (tracked in engine)

```dart
class ActivePotionEffects {
  final bool secondChanceActive;     // Next wrong tap absorbed (consumed on use)
  final int fortuneTonicRoundsLeft;  // Countdown: 5 → 0, doubles drop rate while > 0
  final bool timerFrozen;            // Time Freeze active (5s real-time, then auto-expires)
  final double timerFreezeRemaining; // Seconds left on freeze
  final bool reviveAvailable;        // Revive potion queued (triggers on death instead of game over)
}
```

---

## 4.2 Game Modes

### Classic Mode
* **Hearts:** 3
* **Session:** Endless challenges until hearts reach 0.
* **Difficulty:** Progressive tiers (see Section 4.6).
* **Scoring:** Standard formula.
* **Leaderboard:** Ranked by player's best total score.

### Blitz Mode
* **Hearts:** None (no hearts, cannot die from wrong answers).
* **Session:** Fixed 60-second global countdown. No per-grid timer. Grids stay on screen until answered correctly. Wrong answers waste time but don't advance the grid.
* **Timer:** Single global 60s timer displayed prominently. `globalTimeRemaining` in `GameState`. When it hits 0, session ends immediately.
* **Difficulty:** Medium difficulty throughout.
* **Scoring:** Standard formula (100 base + time bonus per correct grid). Time bonus uses global time remaining, not per-grid time. `(globalTimeRemaining * 10).round()` bonus per correct answer — rewards speed.
* **Leaderboard:** Ranked by player's best total score within 60 seconds.

### Daily Mode
* **Hearts:** 3
* **Session:** Fixed sequence of 10 challenges. Same seed for all players on a given day.
* **Difficulty:** Curated mix (3 easy, 4 medium, 3 hard).
* **Scoring:** Standard formula.
* **Leaderboard:** Separate daily leaderboard, resets at midnight UTC.
* **Attempts:** One attempt per day. Failed attempt still counts.

---

## 4.3 App Lifecycle (Backgrounding)

**Timer does NOT pause when the app is backgrounded.** This is a deliberate design choice.

* If the player switches away (phone call, notification, lock screen), the game timer keeps running.
* Hearts can be lost from timeouts while backgrounded.
* If the player returns and hearts > 0, the game continues from wherever the timer left off.
* If hearts reached 0 while backgrounded, the player returns to the Game Over screen.
* **No save/restore on app kill.** If the OS kills the app mid-game, the session is lost. The player starts fresh next time.
* Blitz mode: the 60s global timer keeps running. Backgrounding wastes your time.
* This prevents pause-abuse (pausing to think about the answer).

**Implementation:** Use `WidgetsBindingObserver.didChangeAppLifecycleState`. On `paused`/`inactive`, do nothing — let the timer `Ticker` continue. On `resumed`, sync the timer with elapsed real time.

---

## 4.4 Timer System

### Implementation

* Use `Ticker` or `Timer.periodic`
* **Resets** fully after every correct answer (next grid)
* **Decays** based on the current grid index within the challenge
* **Keeps running on wrong answer** — timer does not pause or reset on wrong tap

**Formula:**

```dart
double calculateTime({
  required int gridIndex, // 0 to 4
}) {
  const baseTime = 6.0; // Seconds
  const decay = 1.0;
  return max(baseTime - (gridIndex * decay), 2.0); // Caps at 2s minimum
}
```

* Grid 0: 6s
* Grid 1: 5s
* Grid 2: 4s
* Grid 3: 3s
* Grid 4: 2s

### Timeout Behaviour

* Timer expires → Move to **next grid** immediately.
* **Penalty:** Deduct 1 Heart (Classic/Daily only. Blitz: no penalty, just time loss).
* If this was the 5th grid (index 4), advance to next challenge.

---

## 4.5 Gameplay Rules (Confirmed)

### Wrong Answer
* **Action:** Deduct 1 Heart (unless Second Chance potion is active — absorb and consume it).
* **Timer:** Keeps running. No pause, no reset.
* **State:** Stay on current grid. User must try again.
* **Feedback:** Heavy Haptic + Error Sound.
* **Blitz exception:** No heart deduction, timer keeps running.

### Correct Answer
* **Action:** Add Score.
* **Timer:** Reset to `calculateTime(gridIndex: nextGridIndex)`.
* **State:** Move to next grid.
* **Feedback:** Medium Haptic + Success Chime.

### Timeout
* **Action:** Deduct 1 Heart (Classic/Daily). No deduction in Blitz.
* **State:** Move to next grid immediately.
* **Feedback:** Heavy Haptic + Error Sound.

### Game Over (hearts reach 0)
1. Check if Revive potion is queued → if yes, resurrect with 1 Heart, consume Revive, continue.
2. Otherwise → transition to Game Over screen.
3. Game Over screen shows: final score, bits earned, round reached, potions dropped.
4. Options: Submit score to leaderboard, return to menu, play again.

### Scoring Formula
* **Base:** 100 points per correct grid.
* **Bonus (Classic/Daily):** `(timeRemaining * 10).round()` points (per-grid timer).
* **Bonus (Blitz):** `(globalTimeRemaining * 10).round()` points (global 60s timer). Rewards answering early in the session.
* **Grid Skip potion (Classic/Daily):** Awards base 100 points + max possible time bonus for that grid index.
* **Grid Skip potion (Blitz):** Awards base 100 points + `(globalTimeRemaining * 10).round()` bonus.

### Bits Earning
* **Formula:** `bitsEarned = (finalScore / 10).floor()`
* Bits are awarded at the end of a session (on game over or Blitz timer expiry).
* Bits are credited to `profiles.bits` via Supabase RPC.

---

## 4.6 Round Definition

**1 Round = 1 Challenge (5 grids).**

* Completing all 5 grids of a challenge (whether by correct answers, timeouts, or Grid Skip) = 1 round completed.
* Potion drops are evaluated at round completion.
* Milestone rounds: 5, 10, 15, 20, etc.

### Challenge Completion Flow

1. Player completes grid 4 (the 5th grid, index 0-4) of the current challenge.
2. Engine evaluates potion drop (see Section 17).
3. Challenge transition banner displays briefly.
4. Next challenge loads with grid index reset to 0.
5. Timer resets to full 6s for the new challenge's first grid.

---

## 4.7 Difficulty Scaling (Classic Mode — Progressive Tiers)

| Challenge Range | Difficulty | Number Range | Distractor Closeness |
|---|---|---|---|
| 1-5 | Easy | 1-50 | Distractors differ by 10+ from correct |
| 6-10 | Easy + Medium mix | 1-100 | Distractors differ by 5-10 |
| 11-15 | Medium | 1-200 | Distractors differ by 3-8 |
| 16-20 | Medium + Hard mix | 1-500 | Distractors differ by 2-5 |
| 21+ | Hard | 1-1000 | Distractors differ by 1-3 |

**Parameters that scale:**
* Number range (min/max values in the grid)
* Distractor closeness (how near wrong answers are to the correct one)
* Challenge types introduced gradually (easy types first, complex types later)

**Blitz Mode:** Fixed at Medium tier parameters throughout.

**Daily Mode:** Curated per-challenge — difficulty is set per challenge in the daily seed.

---

## 4.8 Challenge Sequencing

### Classic Mode
* Challenges are selected randomly from the available pool for the current difficulty tier.
* No repeat of the same challenge type within 3 consecutive rounds.
* Gradually introduces harder challenge types (Highest/Lowest in early rounds, Prime/Sum later).

### Blitz Mode
* Random selection from all 6 types at Medium difficulty.
* No sequencing constraints — pure speed.

### Daily Mode
* Fixed sequence determined by daily seed (date-based).
* All players see the same 10 challenges in the same order.

---

# 5. Challenge System

## 5.1 Challenge Types (Core Set — 6 Types)

| Type | Instruction | Difficulty | Notes |
|---|---|---|---|
| `highest` | "Find the highest number" | Easy | Straightforward comparison |
| `lowest` | "Find the lowest number" | Easy | Straightforward comparison |
| `closest` | "Find the number closest to N" | Medium | Requires mental distance calculation |
| `odd_one_out` | "Find the only odd (or even) number" | Medium | 8 numbers share parity, 1 doesn't |
| `prime` | "Find the prime number" | Hard | 1 prime, 8 composites |
| `sum_to_n` | "Find two numbers that sum to N" | Hard | Requires selecting 2 cells, not 1 |

### `sum_to_n` Special Handling
* Grid contains exactly 1 valid pair that sums to N.
* Player must tap **two cells** (both correct) to succeed.
* Timer does not reset between the two taps.
* Wrong first tap → heart loss as usual.
* Correct first tap + wrong second tap → heart loss, both taps reset.

## 5.2 Challenge Model

```dart
class Challenge {
  final String id;
  final String instruction;     // Display text, e.g. "Find the highest number"
  final ChallengeType type;
  final Difficulty difficulty;
  final GridRules rules;
}

enum ChallengeType { highest, lowest, closest, oddOneOut, prime, sumToN }

enum Difficulty { easy, medium, hard }

class GridRules {
  final int minValue;           // Minimum number in grid (e.g. 1)
  final int maxValue;           // Maximum number in grid (e.g. 50 for easy, 1000 for hard)
  final int distractorMinDelta; // Minimum distance between correct answer and distractors
  final int distractorMaxDelta; // Maximum distance between correct answer and distractors
  final int? targetValue;       // For 'closest' and 'sum_to_n' types — the target N
  final int requiredSelections; // 1 for most types, 2 for sum_to_n
}
```

---

## 5.3 Fixed Challenges (Easy / Medium / Hard)

* Stored locally as JSON
* Loaded at app start
* Immutable

```
assets/challenges/easy.json
assets/challenges/medium.json
assets/challenges/hard.json
```

Each JSON file contains an array of Challenge objects (without grids — grids are generated at runtime).

### JSON File Format

The JSON structure must match the Dart `Challenge` model and be consistent with the Supabase `challenges.config` JSONB format.

**Example `assets/challenges/easy.json`:**

```json
[
  {
    "id": "easy_highest_01",
    "instruction": "Find the highest number",
    "type": "highest",
    "difficulty": "easy",
    "rules": {
      "min_value": 1,
      "max_value": 50,
      "distractor_min_delta": 10,
      "distractor_max_delta": 30,
      "target_value": null,
      "required_selections": 1
    }
  },
  {
    "id": "easy_lowest_01",
    "instruction": "Find the lowest number",
    "type": "lowest",
    "difficulty": "easy",
    "rules": {
      "min_value": 1,
      "max_value": 50,
      "distractor_min_delta": 10,
      "distractor_max_delta": 30,
      "target_value": null,
      "required_selections": 1
    }
  }
]
```

**Example `assets/challenges/medium.json`:**

```json
[
  {
    "id": "med_closest_01",
    "instruction": "Find the number closest to 75",
    "type": "closest",
    "difficulty": "medium",
    "rules": {
      "min_value": 1,
      "max_value": 200,
      "distractor_min_delta": 3,
      "distractor_max_delta": 8,
      "target_value": 75,
      "required_selections": 1
    }
  },
  {
    "id": "med_odd_one_out_01",
    "instruction": "Find the only odd number",
    "type": "odd_one_out",
    "difficulty": "medium",
    "rules": {
      "min_value": 1,
      "max_value": 200,
      "distractor_min_delta": 3,
      "distractor_max_delta": 8,
      "target_value": null,
      "required_selections": 1
    }
  }
]
```

**Example `assets/challenges/hard.json`:**

```json
[
  {
    "id": "hard_prime_01",
    "instruction": "Find the prime number",
    "type": "prime",
    "difficulty": "hard",
    "rules": {
      "min_value": 1,
      "max_value": 1000,
      "distractor_min_delta": 1,
      "distractor_max_delta": 3,
      "target_value": null,
      "required_selections": 1
    }
  },
  {
    "id": "hard_sum_01",
    "instruction": "Find two numbers that sum to 100",
    "type": "sum_to_n",
    "difficulty": "hard",
    "rules": {
      "min_value": 1,
      "max_value": 1000,
      "distractor_min_delta": 1,
      "distractor_max_delta": 3,
      "target_value": 100,
      "required_selections": 2
    }
  }
]
```

**Parsing:** The same `Challenge.fromJson()` factory must handle both local JSON files and Supabase `challenges` rows (where `rules` maps to `config` JSONB). Use a shared parser.

---

## 5.4 AI Challenges

### AI Usage Pattern

* AI generates **challenge templates** (instruction + type + rules)
* Stored in Supabase `challenges` table
* Pulled at session start — **never generated mid-game**
* AI service: configurable (Claude API, OpenAI, etc.) — abstracted behind a service interface in `core/services/`

### Validation Layer (Mandatory)

Before usage, every AI-generated challenge must pass:

* Exactly one valid answer (or one valid pair for sum_to_n)
* Computable rule (the engine can verify correctness programmatically)
* Grid constraints respected (min/max values, distractor deltas)
* No duplicate numbers in a single grid

Invalid AI challenges are discarded silently.

### Fallback

If AI challenges fail to load or all are invalid, fall back to fixed challenges.

---

# 6. Grid Generation Logic

### Grid Rules

* **Structure:** 1 Challenge = 5 Grids
* **Layout:** 3x3 (9 numbers total)
* **Logic:**
  * 1 Correct Answer (or 2 for `sum_to_n`)
  * 8 Incorrect Answers / 7 for `sum_to_n` (Distractors must be plausible)
  * No duplicate numbers within a single grid
  * Numbers are randomly positioned in the 3x3 layout (shuffled each grid)

```dart
List<int> generateGrid(Challenge challenge, int gridIndex) {
  // Uses challenge.rules for constraints
  // gridIndex affects nothing here — difficulty is per-challenge, not per-grid
  // Returns 9 integers, shuffled, with correct answer(s) embedded
}
```

### Deterministic Mode (Daily Challenges)

For Daily Mode, grid generation uses a seeded random (`Random(dailySeed + challengeIndex + gridIndex)`) so all players see identical grids.

---

# 7. Flutter UI Design

## 7.1 Screen Flow

```
Splash → Auth → Home (Mode Selection) → [Potion Selection Sheet] → Game Screen → Game Over → Home
                  ↓                                                                    ↓
              Profile                                                             Leaderboards
                  ↓
              Store (Potions)
```

### Pre-Game Potion Selection

When a player taps a mode on the Home screen:
1. A **bottom sheet** slides up showing:
   * 3 empty potion slots at the top.
   * The player's inventory below (grid of potion icons with counts).
   * Tap a potion → fills the next empty slot. Tap a filled slot → removes it.
   * "Start Game" button at the bottom (enabled even with 0 potions selected).
2. Tapping "Start Game" navigates to `/game/:mode` with selected potions passed as route state.
3. If the player has no potions at all, the bottom sheet still appears but shows "No potions — earn them by playing!" with a direct "Start Game" button.

### Routing (GoRouter)

* `/` — Splash (auto-redirect to `/auth` or `/home`)
* `/auth` — Login screen
* `/home` — Mode selection, quick stats, play button per mode
* `/game/:mode` — Game screen (Classic, Blitz, Daily). Receives selected potions via `extra` route state.
* `/game-over` — Results screen (score, bits, round, potions dropped)
* `/leaderboard/:mode` — Leaderboard by mode (global + regional tabs)
* `/profile` — Profile + inventory + settings (audio/haptics toggles)
* `/store` — Potion store

Auth redirect guard: unauthenticated users → `/auth`.

---

## 7.2 Game Screen Layout

```
------------------------------------------
 [❤❤❤]       [Timer Bar]       [Score: 0]
------------------------------------------
 "Find the highest number"
------------------------------------------
          [ 23 ] [ 47 ] [ 12 ]
          [  8 ] [ 91 ] [ 35 ]
          [ 56 ] [ 74 ] [ 19 ]
------------------------------------------
 [🧪 Time Freeze] [🧪 Scanner] [🧪 50/50]
------------------------------------------
```

### Grid Widget
* Stateless
* Receives numbers + tap callback
* No logic inside

### Potion Tray (bottom of game screen)
* Shows up to 3 pre-selected potions
* Manual-activation potions (Scanner, 50/50, Time Freeze, Grid Skip) are tappable
* Auto-activation potions (Second Chance, Revive) show as passive indicators
* Greyed out when consumed or not applicable

---

## 8. Animations & Feedback

Use:

* `AnimatedContainer`
* `TweenAnimationBuilder`
* `Lottie` (optional)

### Required Feedback

* Heart loss animation (heart icon shatters/fades)
* Timer pulse under 2 seconds (bar turns red + pulses)
* Grid cell flash on wrong tap (red flash, 200ms)
* Grid cell flash on correct tap (green flash, 200ms)
* Challenge transition banner (slide in/out between challenges)
* Potion activation visual effect (glow/sparkle on the potion icon)

---

## 8.1 Audio & Haptics (Premium Feel)

### Haptics (HapticFeedback)
* **Light Impact:** Button press, grid cell tap.
* **Medium Impact:** Correct answer.
* **Heavy Impact:** Wrong answer / Timeout.

### Audio (audioplayers package)
* **Tick-Tock:** Last 3 seconds of timer.
* **Success Chime:** High pitch, crisp.
* **Error Buzz:** Low pitch, subtle.
* **Level Complete:** Short jingle (challenge transition).
* **Potion Use:** Magical sparkle sound.
* **Game Over:** Descending tone.

Audio must be preloaded at game start to avoid latency.

---

# 9. Authentication (Supabase)

## 9.1 Supabase Setup

* Google OAuth
* Apple Sign-In (iOS requirement for App Store)

### Flutter Packages

* `supabase_flutter`
* `sign_in_with_apple`

### Auth Flow

1. App opens → attempt silent login via Supabase session refresh.
2. If no session → show Auth screen with Google + Apple buttons.
3. On first login → `handle_new_user` trigger creates profile + inventory.
4. Country/region captured once via device locale (`Platform.localeName`).
5. GoRouter auth guard redirects unauthenticated users.

### Account Deletion (Required for App Store)

Apple App Store Review Guideline 5.1.1(v) requires apps with account creation to offer account deletion.

* **Location:** Profile screen → "Delete Account" button (red, at bottom).
* **Flow:** Tap → confirmation dialog ("This will permanently delete your account, scores, and inventory. This cannot be undone.") → re-authenticate → call `delete_user_account` RPC.
* **Server-side:** `delete_user_account` RPC (security definer) deletes all user data (profile, scores, inventory, transactions) then calls `auth.admin.deleteUser()` via Supabase Admin API or Edge Function.
* **Client-side:** On success, clear local storage, sign out, navigate to `/auth`.
* All tables use `ON DELETE CASCADE` so deleting the profile cascades to scores, inventory, and transactions.

---

# 10. Leaderboards

## 10.1 Leaderboard Strategy

* Server-authoritative (scores validated via RPC — see Supabase schema)
* Score submitted at end of session via `submit_game_score` RPC
* Mode-specific leaderboards (Classic, Blitz, Daily)
* **Best score per player:** Each player appears once with their highest score for that mode. The `get_leaderboard` RPC uses `DISTINCT ON (user_id)` to deduplicate.

### Queries (via Supabase RPC)

* **Global leaderboard:** Top 100 by mode (best per player), paginated.
* **Regional leaderboard:** Top 100 filtered by `country_code` (best per player), paginated.
* **Player rank:** Player's own rank within global + regional (based on their best score).
* **Daily leaderboard:** Resets at midnight UTC. Only today's scores. Each player appears once (one attempt per day enforced by RPC).

---

# 11. Data Persistence

### Local

* **SharedPreferences:** Settings (audio on/off, haptics on/off)
* **Cached challenges:** Fixed challenge JSON (bundled with app)
* **Offline queue:** Pending score submissions + inventory changes stored locally until sync

### Remote (Supabase)

* User profiles
* Scores (validated via RPC)
* AI challenges
* Inventory (mutated via RPC only)
* Store catalog
* Transaction log

---

# 12. Offline Support

### Strategy: Offline Play with Sync

* **Fixed challenges** are bundled with the app and always available offline.
* **AI challenges** require network. If unavailable, fall back to fixed challenges.
* **Scores earned offline** are queued locally (SharedPreferences or SQLite) with a `pending_sync` flag.
* **On reconnect:** pending scores are submitted via `submit_game_score` RPC in order.
* **Potion drops earned offline** are also queued and synced.
* **Inventory mutations** (potion use) are tracked locally and reconciled on sync.
* **Store purchases** require network (cannot buy offline).
* **Daily mode** requires network to fetch the daily seed and to ensure one-attempt enforcement.

### Conflict Resolution

* Scores: append-only, no conflicts.
* Inventory: server state is authoritative. On sync, client sends deltas (potions used, potions earned), server applies them via RPC.
* If server rejects a delta (e.g. potion count went negative), client state is overwritten by server state.

---

# 13. Performance Considerations

* No rebuilds during timer ticks (use `ValueNotifier` + `ValueListenableBuilder`)
* Preload all assets (audio files, challenge JSON, fonts) during splash screen
* Clamp animation durations — never allow uncapped animations
* Avoid layout thrashing — no `setState` in game-critical loops
* Grid widget is `const`-constructable where possible
* Audio player instances are pre-warmed, not created on demand

---

# 14. Error Handling & Retry

* **Supabase calls:** Wrap in try/catch. On transient failure (network error, timeout), queue for retry with exponential backoff (max 3 retries).
* **Score submission failure:** Store locally, retry on next app open or network change.
* **Auth token expiry:** Supabase handles refresh automatically. If refresh fails, redirect to Auth screen.
* **AI challenge fetch failure:** Fall back to fixed challenges silently. No user-facing error.
* **Critical errors (data corruption, impossible game state):** Log to analytics, force game over, don't crash.

---

# 15. Testing Strategy

### Unit Tests (mandatory, pure Dart)

* Game engine state transitions (correct, wrong, timeout, game over, revive)
* Timer logic (decay formula, freeze interaction, Blitz countdown)
* Grid generation (correct answer count, no duplicates, distractor constraints)
* Scoring formula (base + bonus, grid skip scoring)
* Potion effect logic (all 8 potions, activation, consumption, expiry)
* Potion drop logic (probability, milestone guarantees, rarity scaling, Fortune Tonic modifier)
* Bits calculation
* Difficulty tier selection based on challenge index
* Daily seed determinism (same seed = same grids)

### Widget Tests

* Grid tap interactions (correct, wrong, sum_to_n two-tap)
* Timer display and expiry behaviour
* Heart display and animation trigger
* Potion tray activation/deactivation
* Screen navigation (game over flow, leaderboard)

### Integration Tests

* Full game session (start → play → game over → score submission)
* Auth flow (login → profile creation)
* Offline → online sync

---

# 16. Monetisation-Ready Hooks (Optional)

* Potion store (bits-based purchasing)
* Daily challenges (engagement driver)
* Cosmetic themes (future)
* Ads integration (future — rewarded ads for bonus bits)
* IAP for bits packs (future — `store_items.price_fiat`)

---

# 17. Deployment

### Android

* Play Store (Google Sign-In via Supabase)
* Minimum SDK: 21 (Android 5.0)

### iOS

* App Store
* Apple Sign-In mandatory
* Game Center optional (future)
* Minimum iOS: 14.0

### App Versioning

* Supabase `app_config` table (future) or remote config to enforce minimum app version.
* Client checks version on startup. If below minimum → force update screen.

---

# 18. Development Order (Strongly Recommended)

1. Game engine (pure Dart, fully unit tested)
2. Fixed challenge definitions (JSON for all 6 types)
3. Timer + hearts logic (integrated into engine)
4. Grid generation (with distractor logic)
5. Difficulty tier system
6. Flutter UI (game screen, grid widget, HUD)
7. Potion engine logic (all 8 potions, effects, drops)
8. Supabase auth (Google + Apple)
9. Score submission RPC + leaderboards
10. Daily challenge mode (seed system)
11. Blitz mode
12. Store + bits economy
13. Offline queue + sync
14. Audio & haptics polish
15. Potion tray UI

---

# 19. Potion System (Meta-Layer)

## 19.1 Rarity Tiers

Potions are consumable items that offer strategic advantages.

### Rare (Utility)
* **Time Freeze:** Pauses the game timer for 5 seconds of real time. Remaining grid time is preserved. After 5s, timer resumes from where it was. Manual activation.
* **Second Chance:** The next wrong tap does not deduct a heart. Consumed on the first wrong tap. Auto-triggered (passive).

### Epic (Survival)
* **Heart Refill:** Restores +1 Heart (can exceed starting value, max 4). Manual activation. Can only be used when hearts < max.
* **50/50:** Removes 4 incorrect numbers from the current grid (leaving 1 correct + 4 others). Manual activation.

### Legendary (Game Breakers)
* **Grid Skip:** Instantly solves the current grid. Awards 100 base points + max time bonus for that grid's index. Manual activation.
* **Revive:** If hearts reach 0, resurrect immediately with 1 Heart instead of game over. Auto-triggered (passive). Consumed on death.
* **Fortune Tonic:** For the next 5 rounds (challenges), drop rate is doubled (40% standard, guaranteed on milestones unchanged) and Legendary rarity chance is +5%. Manual activation. Engine tracks `fortuneTonicRoundsLeft`.
* **Scanner:** Highlights the correct answer on the grid for 3 seconds. Timer keeps running during highlight. Manual activation.

## 19.2 Potion Activation Model

### Pre-Game Selection
* Before starting a game, player selects up to **3 potions** from their inventory.
* Selected potions are "loaded" into the session. Unselected potions are unavailable during that game.

### In-Game Activation
* **Auto-triggered potions (passive):** Second Chance, Revive. These activate automatically when their trigger condition is met. Shown as passive indicators in the potion tray.
* **Manual potions (active):** Time Freeze, 50/50, Grid Skip, Scanner, Heart Refill, Fortune Tonic. Player taps the potion icon in the tray to activate. Cannot be activated during transition animations.

### Constraints
* Only one manual potion can be active at a time (e.g. can't stack Time Freeze + Scanner simultaneously).
* Each potion slot can hold 1 potion. Using it consumes it from inventory permanently.
* Potions cannot be swapped mid-game.

## 19.3 Drop Logic (Hybrid Loot)

* **Drop evaluation:** After each completed round (challenge = 5 grids).
* **Standard Rounds:** 20% chance for a drop. (40% if Fortune Tonic active.)
* **Milestone Rounds (5, 10, 15, 20, ...):** **Guaranteed** drop.
* **Rarity Weights:**

| Round Range | Rare | Epic | Legendary |
|---|---|---|---|
| 1-10 | 70% | 25% | 5% |
| 11-20 | 40% | 45% | 15% |
| 21+ | 20% | 45% | 35% |

* **Fortune Tonic modifier:** +5% Legendary (subtracted from Rare).
* **Dropped potions** are added to inventory immediately (or queued for sync if offline).
* **Blitz mode:** No potion drops (session is too short).
* **Daily mode:** Potion drops enabled, same rules as Classic.

---

# 20. Analytics (Future)

Track the following events for product decisions:

* Game start (mode, potions selected)
* Game over (score, round reached, hearts remaining, cause of death)
* Challenge completed (type, time taken, correct/wrong/timeout)
* Potion used (type, round, context)
* Potion dropped (type, rarity, round)
* Store purchase (SKU, bits spent)
* Daily challenge attempt (score, completion)
* Session duration

Implementation: Supabase `analytics_events` table or third-party (Mixpanel, Firebase Analytics). Deferred to post-MVP.
