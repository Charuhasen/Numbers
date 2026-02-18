# UI Design Specification

Comprehensive visual design spec for the Numbers Game. Every screen and component is described here. This replaces the brief layout notes in the high-level design and serves as the single source of truth for all UI implementation.

---

# 1. Design Language

## 1.1 Emotional Tone

Calm. Focused. Intelligent. The app should feel like a premium cognitive training tool, not a flashy arcade game. Every visual decision should encourage concentration and speed without stress.

## 1.2 Color Palette

| Token | Hex | Usage |
|---|---|---|
| `surface` | `#F5F0EB` | Primary background (warm beige) |
| `surfaceVariant` | `#EDE8E2` | Card backgrounds, grid tiles (light sand) |
| `surfaceDim` | `#E5DFD8` | Progress bar track, inactive elements |
| `primary` | `#7C8B9A` | Active elements, filled progress, selected states (muted blue-grey) |
| `primaryContainer` | `#6B7A89` | Pressed/hover state for primary elements |
| `onSurface` | `#3A3A3A` | Primary text, numbers on tiles (dark grey) |
| `onSurfaceVariant` | `#8A8580` | Secondary text, labels, metadata (medium grey) |
| `onPrimary` | `#FFFFFF` | Text/icons on primary-colored backgrounds |
| `error` | `#C4897A` | Wrong answer feedback, heart loss (muted terracotta — not aggressive) |
| `errorContainer` | `#D4A99A` | Error background tint |
| `success` | `#8BA89A` | Correct answer feedback (muted sage green) |
| `successContainer` | `#A3BDA F` | Success background tint |
| `heart` | `#C48A7A` | Heart icons (warm muted coral) |
| `heartEmpty` | `#DDD5CD` | Lost heart placeholder |
| `potionRare` | `#7C8B9A` | Rare potion accent (matches primary) |
| `potionEpic` | `#9A7CB0` | Epic potion accent (muted purple) |
| `potionLegendary` | `#B09A5C` | Legendary potion accent (muted gold) |

### Dark Theme

The palette inverts while preserving the calm tone:

| Token | Hex (Dark) |
|---|---|
| `surface` | `#2A2825` |
| `surfaceVariant` | `#353230` |
| `surfaceDim` | `#1E1D1B` |
| `primary` | `#9AACBE` |
| `onSurface` | `#E8E4E0` |
| `onSurfaceVariant` | `#9A9590` |

All other tokens adjust proportionally. Use `ColorScheme.fromSeed` with a custom `seedColor` close to `#7C8B9A` and override specific slots.

## 1.3 Typography

Clean sans-serif. Use the system default (`Roboto` on Android, `SF Pro` on iOS) or bundle `Inter` for cross-platform consistency.

| Style | Weight | Size | Usage |
|---|---|---|---|
| `headlineLarge` | 600 (Semi) | 28sp | Score display, game over score |
| `headlineMedium` | 500 (Medium) | 22sp | Challenge instruction text |
| `titleMedium` | 500 (Medium) | 16sp | Section headings, mode titles |
| `titleSmall` | 500 (Medium) | 14sp | Card titles, potion names |
| `labelLarge` | 500 (Medium) | 14sp | Button text |
| `labelMedium` | 400 (Regular) | 12sp | Stat labels ("ACCURACY", "SCORE") — uppercase, +1.5 letter spacing |
| `labelSmall` | 400 (Regular) | 10sp | Metadata, timestamps |
| `bodyLarge` | 400 (Regular) | 16sp | Body text, descriptions |
| `displayLarge` | 700 (Bold) | 36sp | Grid tile numbers |

## 1.4 Spacing & Layout

- Base unit: 8dp
- Screen padding: 24dp horizontal, 16dp top/bottom
- Grid gap: 12dp between tiles
- Card border radius: 16dp
- Tile border radius: 12dp
- Button border radius: 12dp
- Elevation: use soft shadows only (`elevation: 2` equivalent, `blur: 8, spread: 0, opacity: 0.06`)
- No hard borders or outlines anywhere. Depth via subtle shadow and fill color.

## 1.5 Iconography

Simple, thin-line icons. Use Material Symbols (Rounded, weight 300) or a consistent icon set.

- Exit: `close` (X)
- Pause: not used (no pause feature)
- Heart: custom filled heart shape, not Material icon
- Timer: thin circular progress or horizontal bar
- Potions: custom minimal icons per type (flask silhouettes)

---

# 2. Game Screen (Core Gameplay)

The most important screen. Every element is designed for zero distraction during play.

## 2.1 Layout Structure

```
┌──────────────────────────────────────────┐
│ Status Bar (system)                       │
├──────────────────────────────────────────┤
│ [X]    CHALLENGE 3 OF 5    [❤ ❤ ❤]      │  ← Top Bar
│        ● ● ● ○ ○                         │  ← Grid Progress Dots
├──────────────────────────────────────────┤
│                                          │
│       "Pick the Highest Number"          │  ← Instruction
│            ROUND 4                       │  ← Round Counter
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │  [  Timer Bar  ██████░░░░░░░░░░░]  │ │  ← Timer
│  └─────────────────────────────────────┘ │
│                                          │
│     ┌────┐   ┌────┐   ┌────┐           │
│     │ 23 │   │ 47 │   │ 12 │           │  ← Grid Row 1
│     └────┘   └────┘   └────┘           │
│     ┌────┐   ┌────┐   ┌────┐           │
│     │  8 │   │ 91 │   │ 35 │           │  ← Grid Row 2
│     └────┘   └────┘   └────┘           │
│     ┌────┐   ┌────┐   ┌────┐           │
│     │ 56 │   │ 74 │   │ 19 │           │  ← Grid Row 3
│     └────┘   └────┘   └────┘           │
│                                          │
├──────────────────────────────────────────┤
│  SCORE          BEST          TIME       │  ← Stats Bar
│  1,240          2,800         0:45       │
├──────────────────────────────────────────┤
│  [🧪 Freeze]  [🧪 Scanner]  [🧪 50/50] │  ← Potion Tray
└──────────────────────────────────────────┘
```

## 2.2 Top Bar

**Height:** 48dp

**Left:** Subtle "X" icon (`onSurfaceVariant` color, 20dp). Taps → confirmation dialog ("Leave game? Progress will be lost.") → exit to `/home`.

**Center:**
- Primary label: "CHALLENGE 3 OF 5" — `labelMedium`, `onSurfaceVariant`, uppercase, +1.5 letter spacing.
  - Classic: "CHALLENGE {challengeIndex + 1}" (no "of" — endless)
  - Blitz: "BLITZ" (static label)
- Below: Grid progress dots — 5 small circles (8dp diameter, 6dp gap).
  - Completed grids: filled `primary`
  - Current grid: filled `primary` with subtle pulse animation
  - Upcoming grids: `surfaceDim`
  - Resets to all empty on new challenge.

**Right:** Hearts row.
- Classic: 3 heart icons (16dp each, 4dp gap).
  - Active: filled `heart` color
  - Lost: `heartEmpty` color, slightly smaller (scale 0.85)
  - Heart loss: heart shrinks + fades out (200ms ease-out)
- Blitz: No hearts shown. Space is empty or shows a minimal "BLITZ" badge.

## 2.3 Challenge Instruction

**Centered, vertical stack:**

- Primary: `headlineMedium`, `onSurface`, center-aligned.
  - e.g. "Pick the Highest Number"
- Secondary: `labelMedium`, `onSurfaceVariant`, uppercase, +1.5 letter spacing.
  - Classic: "ROUND {challengeIndex + 1}" (the current round number)
  - Blitz: show nothing (the timer is the focus)

**Spacing:** 32dp below top bar, 8dp between primary and secondary, 24dp below secondary to timer.

## 2.4 Timer Bar

**Horizontal progress bar:**
- Height: 6dp, full width minus 48dp horizontal padding
- Rounded ends (3dp radius)
- Track: `surfaceDim`
- Fill: `primary` — animates from right to left as time decreases
- When under 2 seconds remaining:
  - Fill color transitions to `error` (muted terracotta)
  - Gentle pulse animation (scale 1.0 → 1.02 → 1.0, 500ms loop)

**Blitz mode:** The timer bar represents the global 60s countdown instead of per-grid time. Always visible, same styling.

**Spacing:** 16dp below instruction area, 32dp above grid.

## 2.5 Game Grid

**3x3 grid of square tiles.**

**Tile sizing:** Calculate dynamically: `(screenWidth - 48dp padding - 24dp gaps) / 3`. Tiles are square. Max tile size: 110dp (constrain on tablets).

**Default tile state:**
- Background: `surfaceVariant`
- Border radius: 12dp
- Shadow: `offset(0, 2), blur: 8, color: #000000 at 6% opacity`
- Number: `displayLarge` (36sp, bold), `onSurface`, centered

**Tap animation:** On press, tile scales to 0.95 (100ms ease-in), then back to 1.0 (100ms ease-out).

**Correct answer state:**
- Background smoothly transitions to `success` (200ms)
- Number color transitions to `onPrimary` (white)
- After 200ms, tile fades out and grid transitions to next

**Wrong answer state:**
- Background flashes `error` (100ms on, 150ms fade back to `surfaceVariant`)
- Number briefly shakes horizontally (3dp, 2 oscillations, 200ms)
- Tile returns to default state — player must try again

**Timeout state (grid advancing):**
- All tiles briefly dim (opacity 0.5, 150ms)
- Grid crossfades to next grid

**50/50 potion effect:**
- 4 tiles fade to `surfaceDim` with numbers at 20% opacity (300ms ease-out)
- Remaining 5 tiles stay normal

**Scanner potion effect:**
- Correct tile gets a soft glowing border in `success` color (2dp, animated glow pulse)
- Glow persists for 3 seconds then fades out (300ms)

**sum_to_n first-tap state:**
- First correctly tapped number stays highlighted in `primary` background
- Player taps the second number to complete

## 2.6 Stats Bar

**Fixed row between grid and potion tray.**

**Height:** 56dp. Three equal columns separated by 1dp vertical lines in `surfaceDim`.

**Left column — Score:**
- Label: "SCORE" — `labelMedium`, `onSurfaceVariant`, uppercase
- Value: `titleMedium`, `onSurface`, bold — e.g. "1,240"
- Score increments animate (count-up, 300ms)

**Center column — Best Score:**
- Label: "BEST" — `labelMedium`, `onSurfaceVariant`, uppercase
- Value: `titleMedium`, `onSurface`, bold — e.g. "2,800"
- Shows the player's best score for this mode (fetched at session start)
- If current score surpasses best: value color transitions to `primary` with a subtle glow

**Right column — Time:**
- Label: "TIME" — `labelMedium`, `onSurfaceVariant`, uppercase
- Value: `titleMedium`, `onSurface`, bold — e.g. "0:45"
- Classic: shows elapsed session time (counting up)
- Blitz: shows remaining global time (counting down), color shifts to `error` under 10s

## 2.7 Potion Tray

**Fixed at bottom, above safe area inset.**

**Height:** 64dp. Horizontal row of 3 potion slots, evenly spaced.

**Slot with potion:**
- Rounded rectangle: 56dp x 48dp, `surfaceVariant` background, 10dp radius
- Potion icon (24dp) centered, tinted by rarity color (`potionRare`, `potionEpic`, `potionLegendary`)
- Potion name below icon: `labelSmall`, `onSurfaceVariant`, truncated to 1 line
- Tap → activates potion (if manual type). Brief glow animation in rarity color.

**Slot consumed/empty:**
- Same shape, `surfaceDim` background, dashed border in `onSurfaceVariant` at 30% opacity
- No icon or text

**Auto-triggered potions (Second Chance, Revive):**
- Show a small status indicator dot in the top-right corner of the slot
- Dot: 8dp, filled `success` when active, `surfaceDim` when consumed
- Not tappable — no press animation

**Slot unavailable during activation:**
- Other slots dim to 50% opacity while a manual potion is active

---

# 3. Game Screen — Mode Variations

## 3.1 Classic Mode

Standard layout as described above. All elements visible.

## 3.2 Blitz Mode

Differences from standard:
- **Top bar center:** "BLITZ" label. No "CHALLENGE X" text.
- **Top bar right:** No hearts. Show remaining grid count or leave empty.
- **Grid progress dots:** Still show 5 dots per challenge.
- **Timer bar:** Represents global 60s countdown. Thicker (8dp) for prominence.
- **Instruction:** Shows challenge instruction but no "ROUND X" secondary text.
- **Stats bar time column:** Shows global countdown prominently, matches timer bar.
- **Potion tray:** Not shown (no potions in Blitz). Stats bar sits at the bottom.

---

# 4. Home Screen

## 4.1 Layout

```
┌──────────────────────────────────────────┐
│ Status Bar (system)                       │
├──────────────────────────────────────────┤
│                                          │
│        NUMBERS GAME                      │  ← App title
│                                          │
│     [Avatar]  Username                   │  ← Player info
│     🪙 1,240 bits                        │
│                                          │
├──────────────────────────────────────────┤
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  CLASSIC                          │  │  ← Mode Card
│  │  Endless. Beat your best.         │  │
│  │  Best: 2,800    ▸ PLAY            │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  BLITZ                            │  │
│  │  60 seconds. Max speed.           │  │
│  │  Best: 1,420    ▸ PLAY            │  │
│  └────────────────────────────────────┘  │
│                                          │
│                                          │
├──────────────────────────────────────────┤
│  [🏆 Leaderboard]  [👤 Profile]  [🛒]  │  ← Bottom Nav
└──────────────────────────────────────────┘
```

## 4.2 App Title

- "NUMBERS GAME" — `headlineLarge`, `onSurface`, centered, +2 letter spacing
- 32dp top padding from safe area

## 4.3 Player Info Row

- Avatar: 40dp circle, loaded from `profiles.avatar_url`, fallback initial letter on `primary` background
- Username: `titleMedium`, `onSurface`, 12dp left of avatar
- Bits: `labelMedium`, `onSurfaceVariant` — coin icon (🪙 or custom) + formatted number
- Row: 16dp below title, centered horizontally

## 4.4 Mode Cards

Three cards stacked vertically, 12dp gap.

**Card:**
- Full width (minus 24dp horizontal padding)
- Background: `surfaceVariant`
- Border radius: 16dp
- Shadow: standard soft shadow
- Padding: 20dp all sides

**Content:**
- Mode name: `titleMedium`, `onSurface`, bold, uppercase
- Description: `bodyLarge`, `onSurfaceVariant`, 4dp below name
- Bottom row (8dp above bottom): Best score label + "PLAY" button
  - Best score: `labelMedium`, `onSurfaceVariant` — e.g. "Best: 2,800"
  - "PLAY" button: text button, `primary` color, `labelLarge`, bold. Right-aligned with subtle arrow icon.

**Tap → opens potion selection bottom sheet (except Blitz, which skips to game).**

## 4.5 Bottom Navigation

- 3 icons in a row, evenly spaced, 56dp height
- Leaderboard (trophy icon), Profile (person icon), Store (bag/cart icon)
- Icon: 24dp, `onSurfaceVariant`
- Label below: `labelSmall`, `onSurfaceVariant`
- Active state (current tab): icon + label in `primary`

---

# 5. Potion Selection Bottom Sheet

Slides up when a player taps "PLAY" on a mode card (except Blitz).

## 5.1 Layout

```
┌──────────────────────────────────────────┐
│  ──── (drag handle)                      │
│                                          │
│  SELECT POTIONS                          │  ← Title
│  Choose up to 3 for this session         │
│                                          │
│  ┌──────┐  ┌──────┐  ┌──────┐          │  ← 3 Potion Slots
│  │  +   │  │  +   │  │  +   │          │
│  └──────┘  └──────┘  └──────┘          │
│                                          │
│  YOUR INVENTORY                          │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐          │  ← Inventory Grid
│  │ 🧪 │ │ 🧪 │ │ 🧪 │ │ 🧪 │          │
│  │ x3  │ │ x1  │ │ x2  │ │ x0  │          │
│  └────┘ └────┘ └────┘ └────┘          │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐          │
│  │ 🧪 │ │ 🧪 │ │ 🧪 │ │ 🧪 │          │
│  │ x0  │ │ x1  │ │ x0  │ │ x0  │          │
│  └────┘ └────┘ └────┘ └────┘          │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │           START GAME               │  │  ← CTA Button
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

## 5.2 Components

**Drag handle:** 32dp wide, 4dp tall, `surfaceDim`, centered, 8dp top padding.

**Title:** "SELECT POTIONS" — `titleMedium`, `onSurface`. Subtitle: `bodyLarge`, `onSurfaceVariant`.

**Potion slots (3):**
- 72dp x 72dp, `surfaceVariant`, 12dp radius
- Empty: "+" icon in `onSurfaceVariant`, dashed border
- Filled: potion icon (32dp) tinted by rarity, potion name below (`labelSmall`)
- Tap filled slot → removes it (slides out)

**Inventory grid:**
- 4 columns, 2 rows (8 potion types)
- Each cell: 64dp x 72dp
- Icon (28dp) + count badge (`labelSmall`, bottom-right)
- Count 0: entire cell at 30% opacity, not tappable
- Count > 0: full opacity, tappable → fills next empty slot
- Tinted border-left in rarity color (2dp)

**Start Game button:**
- Full width, 56dp height, `primary` background, `onPrimary` text
- `labelLarge`, bold, uppercase
- 16dp bottom padding (above safe area)
- Enabled always (can start with 0 potions)

**Empty inventory state:**
- Inventory section replaced with: "No potions yet — earn them by playing!" — `bodyLarge`, `onSurfaceVariant`, centered
- Start Game button still visible

---

# 6. Game Over Screen

## 6.1 Layout

```
┌──────────────────────────────────────────┐
│ Status Bar (system)                       │
├──────────────────────────────────────────┤
│                                          │
│            GAME OVER                     │  ← (or "TIME'S UP" for Blitz,
│                                          │     "DAILY COMPLETE" for Daily)
│            2,840                         │  ← Final Score (large)
│         NEW BEST! ✦                      │  ← (conditional)
│                                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ ROUNDS  │ │  BITS   │ │  TIME   │   │  ← Stats Cards
│  │   12    │ │  284    │ │  3:42   │   │
│  └─────────┘ └─────────┘ └─────────┘   │
│                                          │
│  POTIONS EARNED                          │
│  [🧪 Time Freeze]  [🧪 Heart Refill]   │  ← (if any dropped)
│                                          │
│  ┌────────────────────────────────────┐  │
│  │          PLAY AGAIN                │  │  ← Primary CTA
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │         LEADERBOARD                │  │  ← Secondary CTA
│  └────────────────────────────────────┘  │
│                                          │
│         ← Back to Home                   │  ← Text link
│                                          │
└──────────────────────────────────────────┘
```

## 6.2 Components

**Title:** Mode-specific.
- Classic: "GAME OVER" — `headlineMedium`, `onSurface`
- Blitz: "TIME'S UP"

**Score:** `displayLarge` equivalent (48sp), `onSurface`, bold, centered. Count-up animation from 0 (800ms ease-out).

**New best indicator:** "NEW BEST!" — `labelMedium`, `primary`, uppercase. Only shown if this score exceeds the player's previous best for this mode. Subtle sparkle/shimmer animation.

**Stats cards:** 3 cards in a row, equal width.
- Card: `surfaceVariant`, 12dp radius, 16dp padding
- Label: `labelMedium`, `onSurfaceVariant`, uppercase
- Value: `titleMedium`, `onSurface`, bold
- Rounds = challengeIndex (how many challenges completed)
- Bits = bitsEarned
- Time = total session duration

**Potions earned:** Only shown if potions were dropped during the session.
- Section label: `labelMedium`, `onSurfaceVariant`, uppercase
- Row of potion icons with names, tinted by rarity

**Play Again button:** Full width, `primary` background, `onPrimary` text. Same style as Start Game.

**Leaderboard button:** Full width, `surfaceVariant` background, `primary` text (outline/ghost style).

**Back to Home:** Text link, `onSurfaceVariant`, centered. `bodyLarge`.

---

# 7. Auth Screen

## 7.1 Layout

```
┌──────────────────────────────────────────┐
│                                          │
│                                          │
│          NUMBERS GAME                    │  ← Logo / Title
│                                          │
│     Challenge your mind.                 │  ← Tagline
│                                          │
│                                          │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  🍎  Continue with Apple          │  │  ← Apple Sign-In
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  G   Continue with Google         │  │  ← Google Sign-In
│  └────────────────────────────────────┘  │
│                                          │
│                                          │
└──────────────────────────────────────────┘
```

## 7.2 Components

- Background: `surface`
- Title: `headlineLarge`, `onSurface`, centered, +2 letter spacing
- Tagline: `bodyLarge`, `onSurfaceVariant`, centered, 8dp below title
- Both elements vertically centered in the top 60% of the screen

**Auth buttons:**
- Full width (minus 48dp padding), 56dp height
- Apple: black background, white text (Apple's HIG requirement)
- Google: `surfaceVariant` background, `onSurface` text, Google "G" logo
- 12dp gap between buttons
- 12dp border radius
- Positioned in the bottom 40% of the screen

---

# 8. Leaderboard Screen

## 8.1 Layout

```
┌──────────────────────────────────────────┐
│ Status Bar                                │
├──────────────────────────────────────────┤
│ ← Back          LEADERBOARD              │  ← App Bar
├──────────────────────────────────────────┤
│  [Classic]  [Blitz]                       │  ← Mode Tabs
├──────────────────────────────────────────┤
│  [🌍 Global]  [🏳 Regional]              │  ← Scope Toggle
├──────────────────────────────────────────┤
│  YOUR RANK: #42                          │  ← Player Rank Card
│  Best: 2,840                             │
├──────────────────────────────────────────┤
│  #1   PlayerName    ........   12,400    │
│  #2   AnotherUser   ........    9,200    │
│  #3   SomePlayer    ........    8,100    │
│  ...                                     │  ← Scrollable List
│  #42  You           ........    2,840    │  ← Highlighted
│  ...                                     │
└──────────────────────────────────────────┘
```

## 8.2 Components

**App bar:** `surface` background, no elevation. Back arrow (`onSurfaceVariant`), title centered.

**Mode tabs:** 3 pill-shaped tabs.
- Active: `primary` background, `onPrimary` text
- Inactive: `surfaceVariant` background, `onSurfaceVariant` text
- 8dp gap, horizontally scrollable if needed

**Scope toggle:** 2 text tabs below mode tabs.
- Active: `onSurface`, underline in `primary` (2dp)
- Inactive: `onSurfaceVariant`, no underline

**Player rank card:**
- `surfaceVariant` background, 16dp radius, 16dp padding
- Rank number: `headlineMedium`, `primary`
- Best score: `bodyLarge`, `onSurface`
- Only shown if the player has a score for this mode

**Leaderboard list:**
- Each row: 56dp height, full width
- Rank: `labelLarge`, `onSurfaceVariant`, 40dp width
- Avatar: 32dp circle
- Username: `bodyLarge`, `onSurface`, flex fill
- Score: `titleSmall`, `onSurface`, right-aligned
- Current player's row: `surfaceVariant` background highlight
- Top 3: rank number in `primary` color, slightly larger

---

# 9. Profile Screen

## 9.1 Layout

```
┌──────────────────────────────────────────┐
│ Status Bar                                │
├──────────────────────────────────────────┤
│ ← Back            PROFILE                │
├──────────────────────────────────────────┤
│                                          │
│           [Avatar 64dp]                  │
│           Username                       │
│           🪙 1,240 bits                  │
│                                          │
├──────────────────────────────────────────┤
│  STATS                                   │
│  Games Played: 48                        │
│  Best Classic: 2,840                     │
│  Best Blitz: 1,420                       │
├──────────────────────────────────────────┤
│  INVENTORY                               │
│  [Potion grid — same as bottom sheet]    │
├──────────────────────────────────────────┤
│  SETTINGS                                │
│  [Toggle] Sound Effects                  │
│  [Toggle] Haptics                        │
├──────────────────────────────────────────┤
│                                          │
│  [Delete Account]                        │  ← Red text button
│                                          │
└──────────────────────────────────────────┘
```

## 9.2 Components

**Avatar + name:** Centered. Avatar 64dp circle. Username `titleMedium`. Bits row below.

**Stats section:** Simple label-value rows. Label: `bodyLarge`, `onSurfaceVariant`. Value: `bodyLarge`, `onSurface`, right-aligned. Separated by 1dp `surfaceDim` dividers.

**Inventory section:** Same 4x2 grid as the potion selection bottom sheet, but view-only (not tappable). Shows counts for all 8 potion types.

**Settings toggles:** Standard Material Switch widgets. Label: `bodyLarge`, `onSurface`. `primary` color when on.

**Delete Account:** Text button at the very bottom. `error` color, `labelLarge`. Tap → confirmation dialog → re-auth → delete.

---

# 10. Store Screen

## 10.1 Layout

```
┌──────────────────────────────────────────┐
│ Status Bar                                │
├──────────────────────────────────────────┤
│ ← Back       POTION STORE     🪙 1,240  │
├──────────────────────────────────────────┤
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ 🧪 Time Freeze              x1   │  │
│  │ Pause timer for 5 seconds         │  │  ← Item Card
│  │                     🪙 100  [BUY] │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ 🧪 Second Chance            x3   │  │
│  │ Absorb one wrong answer           │  │
│  │                     🪙 80   [BUY] │  │
│  └────────────────────────────────────┘  │
│  ...                                     │
│                                          │
└──────────────────────────────────────────┘
```

## 10.2 Components

**App bar:** Back arrow, "POTION STORE" centered, bits balance right-aligned with coin icon.

**Item cards:** Scrollable list.
- Card: `surfaceVariant`, 16dp radius, 16dp padding
- Left: potion icon (32dp), tinted by rarity
- Rarity indicator: thin left border in rarity color (3dp)
- Name: `titleSmall`, `onSurface`
- Description: `bodyLarge`, `onSurfaceVariant`
- Current count: "x{count}" — `labelMedium`, `onSurfaceVariant`, top-right
- Price: coin icon + amount — `labelLarge`, `onSurface`
- Buy button: `primary` background, `onPrimary` text, 8dp radius, `labelLarge`
- Insufficient bits: buy button at 40% opacity, non-tappable

---

# 11. Splash Screen

- `surface` background
- "NUMBERS GAME" centered, same style as auth screen
- Subtle fade-in animation (300ms)
- No loading spinner — assets preload during this screen
- Auto-redirect to `/auth` or `/home` after preload completes (minimum 800ms display)

---

# 12. Transitions & Micro-Interactions

## 12.1 Screen Transitions

- All screen navigation: Material fade-through (`FadeThroughTransition`, 300ms)
- Bottom sheet: slide up from bottom, 250ms ease-out
- Dialogs: fade + scale (from 0.95 to 1.0, 200ms)

## 12.2 Grid Transitions

- **New grid (within challenge):** Crossfade (200ms). Old grid fades out, new grid fades in.
- **New challenge:** Brief banner slides down from top with challenge instruction (400ms), then grid crossfades in.
- **Game over:** Grid fades out (200ms), screen transitions to game over.

## 12.3 Score Counter

- On correct answer: score number counts up to new value (300ms, ease-out curve). Digits change via vertical slide animation.

## 12.4 Timer Bar

- Smooth continuous animation (not stepped). Use `AnimationController` driven by `Ticker`.
- Color transition from `primary` to `error` at 2s threshold: animated over 300ms.

## 12.5 Potion Activation

- Manual potion tap: icon scales up (1.0 → 1.3, 150ms) then settles back. Rarity-colored ring expands outward and fades (300ms).
- Auto-trigger (Second Chance absorbing a wrong tap): slot briefly flashes `success` (200ms).
- Revive on death: full-screen subtle flash of `success` at 10% opacity (300ms), hearts refill animation.

---

# 13. Responsive Considerations

- **Phone (< 600dp width):** Standard layout as described. Grid tiles sized dynamically.
- **Tablet (600dp+):** Constrain content to 480dp max width, centered. Increase spacing proportionally. Grid tiles cap at 110dp.
- **Web/Desktop:** Same as tablet constraint. Mouse hover states on tiles (background lightens slightly).
- **Safe areas:** Always respect `MediaQuery.padding` for notches, home indicators, etc.
- **Orientation:** Portrait only for game screen. Lock via `SystemChrome.setPreferredOrientations`.

---

# 14. Accessibility

- All interactive elements have minimum 48dp touch target.
- Grid tiles have semantic labels: "Number {value}" for screen readers.
- Timer announced at 10s, 5s, 3s intervals via `SemanticsService.announce`.
- Hearts announced on change: "{count} hearts remaining".
- Color is never the sole indicator — correct/wrong feedback includes animation + haptics + audio.
- Sufficient contrast ratios: `onSurface` on `surface` = 8.5:1, `onSurface` on `surfaceVariant` = 7.2:1. Both exceed WCAG AA.
