# Supabase Schema Design

This schema is designed to support the **Numbers Game** mobile application.
It follows Supabase best practices:
* **Row Level Security (RLS)** is mandatory on every table.
* **UUIDs** are used for primary keys.
* **`profiles`** table extends the default `auth.users` table.
* **Currency and inventory mutations** go through Postgres RPC functions (`security definer`), never direct client writes.
* **Score submission** is server-validated via RPC to prevent cheating.

---

## 1. Tables Overview

| Table Name | Description | RLS Policy |
| :--- | :--- | :--- |
| `profiles` | User metadata (username, avatar, country, bits currency). Extends `auth.users`. | Read all, update own (non-currency fields only). |
| `scores` | Game session results for leaderboards. | Read all. No direct insert — use `submit_game_score` RPC. |
| `inventory` | User's current potion counts. | Read own only. No direct update — use RPC. |
| `challenges` | AI-generated or curated challenge templates. | Read all. Admin insert only. |
| `store_items` | Purchasable items catalog (potions, bundles). | Read active only. Admin insert/update. |
| `transactions` | Purchase and reward audit log. | Read own only. No direct insert — written by RPC. |

---

## 2. Table Definitions

### 2.1 `profiles`

Links directly to `auth.users` via a Trigger.

```sql
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  username text unique,
  display_name text,               -- Fallback display name (from OAuth full_name)
  bits int default 0,              -- Primary currency (Bits). Mutated via RPC only.
  avatar_url text,
  country_code text,               -- ISO 3166-1 alpha-2, captured once from device locale
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indexes
create index idx_profiles_country on public.profiles(country_code);

-- RLS
alter table public.profiles enable row level security;
create policy "Public profiles are viewable by everyone."
  on public.profiles for select using (true);
create policy "Users can insert their own profile."
  on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update their own non-currency profile fields."
  on public.profiles for update using (auth.uid() = id)
  with check (
    -- Prevent direct bits manipulation. Bits can only be changed via RPC.
    bits = (select bits from public.profiles where id = auth.uid())
  );
```

### 2.2 `scores`

Used for Leaderboards. **No direct client insert** — scores are submitted via `submit_game_score` RPC which validates the game session.

```sql
create table public.scores (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  score int not null check (score >= 0),
  mode text not null check (mode in ('classic', 'blitz')),
  round_reached int not null check (round_reached >= 0),
  played_at timestamp with time zone default timezone('utc'::text, now()) not null,

  -- One best-score row per user per mode
  constraint scores_user_mode_unique unique (user_id, mode)
);

-- Indexes for leaderboard queries
create index idx_scores_classic_leaderboard on public.scores(score desc) where mode = 'classic';
create index idx_scores_blitz_leaderboard on public.scores(score desc) where mode = 'blitz';
create index idx_scores_user on public.scores(user_id);

-- RLS
alter table public.scores enable row level security;
create policy "Scores are viewable by everyone."
  on public.scores for select using (true);
-- No insert/update/delete policies for clients. Only RPC (security definer) can insert.
```

### 2.3 `inventory`

Tracks consumable items (Potions). **No direct client update** — all mutations go through RPC functions.

```sql
create table public.inventory (
  user_id uuid references public.profiles(id) on delete cascade not null primary key,

  -- Rare
  potion_time_freeze int default 0 check (potion_time_freeze >= 0),
  potion_second_chance int default 0 check (potion_second_chance >= 0),

  -- Epic
  potion_heart_refill int default 0 check (potion_heart_refill >= 0),
  potion_50_50 int default 0 check (potion_50_50 >= 0),

  -- Legendary
  potion_grid_skip int default 0 check (potion_grid_skip >= 0),
  potion_revive int default 0 check (potion_revive >= 0),
  potion_fortune_tonic int default 0 check (potion_fortune_tonic >= 0),
  potion_scanner int default 0 check (potion_scanner >= 0),

  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS
alter table public.inventory enable row level security;
create policy "Users can view their own inventory."
  on public.inventory for select using (auth.uid() = user_id);
-- No update/insert/delete policies for clients. Only RPC (security definer) can mutate.
```

### 2.4 `challenges` (AI / Content)

Stores generated challenges to ensure all users see the same curated challenge pools.

```sql
create table public.challenges (
  id uuid default gen_random_uuid() primary key,
  instruction text not null,           -- "Find the highest number"
  type text not null check (type in ('highest', 'lowest', 'closest', 'odd_one_out', 'prime', 'sum_to_n')),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  config jsonb not null,               -- Stores GridRules: {"min_value":1, "max_value":50, "distractor_min_delta":10, ...}
  is_validated boolean default false,  -- Must pass validation before use
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS
alter table public.challenges enable row level security;
create policy "Validated challenges are viewable by everyone."
  on public.challenges for select using (is_validated = true);
```

### 2.5 `store_items`

Defines the catalog of purchasable items.

```sql
create table public.store_items (
  id uuid default gen_random_uuid() primary key,
  sku text unique not null,            -- 'potion_time_freeze_x1', 'bits_pack_small'
  name text not null,
  description text,
  price_bits int default 0,            -- Cost in Bits (0 if fiat-only)
  price_fiat decimal(10,2),            -- Cost in real money (null if bits-only)
  type text not null check (type in ('potion', 'heart_refill', 'bundle', 'bits_pack')),
  metadata jsonb,                      -- {"column": "potion_time_freeze", "qty": 1}
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS
alter table public.store_items enable row level security;
create policy "Active store items are viewable by everyone."
  on public.store_items for select using (is_active = true);
-- Admin insert/update handled via service_role key or Supabase dashboard, not client RLS.
```

### 2.6 `transactions`

Audit log for all currency and inventory mutations. Append-only.

```sql
create table public.transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null check (type in ('purchase', 'bits_earned', 'potion_drop', 'potion_used')),
  details jsonb not null,              -- {"sku": "potion_time_freeze_x1", "bits_spent": 100} or {"score_id": "...", "bits_earned": 50}
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indexes
create index idx_transactions_user on public.transactions(user_id, created_at desc);

-- RLS
alter table public.transactions enable row level security;
create policy "Users can view their own transactions."
  on public.transactions for select using (auth.uid() = user_id);
-- No client insert. Only RPC (security definer) writes transactions.
```

---

## 3. Auto-Update Trigger

Automatically sets `updated_at` on row modification for tables that have the column.

```sql
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

create trigger inventory_updated_at
  before update on public.inventory
  for each row execute procedure public.set_updated_at();
```

---

## 4. Database Functions (RPC)

### 4.1 `handle_new_user`

Automatically creates a profile and empty inventory when a user signs up. Handles username collision gracefully.

```sql
create or replace function public.handle_new_user()
returns trigger as $$
declare
  base_name text;
  final_name text;
begin
  base_name := new.raw_user_meta_data->>'full_name';

  -- Handle username uniqueness: append random suffix if collision
  begin
    insert into public.profiles (id, username, display_name, avatar_url)
    values (
      new.id,
      base_name,
      base_name,
      new.raw_user_meta_data->>'avatar_url'
    );
  exception when unique_violation then
    -- Append random 4-digit suffix on collision
    final_name := base_name || '_' || floor(random() * 9000 + 1000)::text;
    insert into public.profiles (id, username, display_name, avatar_url)
    values (
      new.id,
      final_name,
      base_name,
      new.raw_user_meta_data->>'avatar_url'
    );
  end;

  insert into public.inventory (user_id)
  values (new.id);

  return new;
end;
$$ language plpgsql security definer;

-- Trigger
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### 4.2 `submit_game_score`

Server-side score validation and submission. The client sends game events; the server replays and calculates the score.

```sql
create or replace function public.submit_game_score(
  p_mode text,
  p_events jsonb,       -- Array of game events: [{"type":"correct","grid_index":0,"time_remaining":4.2}, ...]
  p_round_reached int
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_calculated_score int := 0;
  v_bits_earned int;
  v_event jsonb;
  v_base_points int := 100;
  v_score_id uuid;
  v_existing_id uuid;
  v_existing_score int;
  v_is_new_best boolean := false;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Validate mode
  if p_mode not in ('classic', 'blitz') then
    raise exception 'Invalid mode: %', p_mode;
  end if;

  -- Replay events and calculate score server-side
  for v_event in select * from jsonb_array_elements(p_events)
  loop
    if (v_event->>'type') = 'correct' then
      v_calculated_score := v_calculated_score + v_base_points
        + round((v_event->>'time_remaining')::numeric * 10)::int;
    elsif (v_event->>'type') = 'grid_skip' then
      -- Grid Skip potion: base + max time bonus for that grid index
      v_calculated_score := v_calculated_score + v_base_points
        + round(greatest(6.0 - (v_event->>'grid_index')::numeric * 1.0, 2.0) * 10)::int;
    end if;
    -- 'wrong' and 'timeout' events don't add score
  end loop;

  -- Calculate bits earned
  v_bits_earned := floor(v_calculated_score / 10.0)::int;

  -- Lock existing row for this user+mode (if any)
  select id, score into v_existing_id, v_existing_score
  from public.scores
  where user_id = v_user_id and mode = p_mode
  for update;

  if v_existing_id is null then
    -- First score for this mode
    insert into public.scores (user_id, score, mode, round_reached)
    values (v_user_id, v_calculated_score, p_mode, p_round_reached)
    returning id into v_score_id;
    v_is_new_best := true;
  elsif v_calculated_score > v_existing_score then
    -- New best score: update the single row
    update public.scores
    set score         = v_calculated_score,
        round_reached = p_round_reached,
        played_at     = timezone('utc'::text, now())
    where id = v_existing_id;
    v_score_id := v_existing_id;
    v_is_new_best := true;
  else
    -- Not a new best; keep existing row unchanged
    v_score_id := v_existing_id;
  end if;

  -- Always credit bits to the player's profile
  update public.profiles
  set bits = bits + v_bits_earned
  where id = v_user_id;

  -- Always log transaction
  insert into public.transactions (user_id, type, details)
  values (v_user_id, 'bits_earned', jsonb_build_object(
    'score_id',    v_score_id,
    'score',       v_calculated_score,
    'bits_earned', v_bits_earned,
    'mode',        p_mode,
    'is_new_best', v_is_new_best
  ));

  return json_build_object(
    'success',     true,
    'score',       v_calculated_score,
    'bits_earned', v_bits_earned,
    'score_id',    v_score_id,
    'is_new_best', v_is_new_best
  );
end;
$$;
```

### 4.3 `purchase_item_with_bits`

Secure transactional purchase based on SKU. Uses `FOR UPDATE` to prevent race conditions.

```sql
create or replace function public.purchase_item_with_bits(item_sku text)
returns json
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_item record;
  v_user_bits int;
  v_potion_column text;
  v_new_balance int;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- 1. Fetch item
  select * into v_item
  from public.store_items
  where sku = item_sku and is_active = true;

  if not found then
    raise exception 'Item not found or inactive';
  end if;

  -- 2. Lock and check balance (FOR UPDATE prevents race condition)
  select bits into v_user_bits
  from public.profiles
  where id = v_user_id
  for update;

  if v_user_bits < v_item.price_bits then
    raise exception 'Insufficient bits';
  end if;

  -- 3. Deduct bits
  v_new_balance := v_user_bits - v_item.price_bits;
  update public.profiles
  set bits = v_new_balance
  where id = v_user_id;

  -- 4. Grant item (potion logic)
  if v_item.type = 'potion' then
    v_potion_column := v_item.metadata->>'column';

    execute format(
      'update public.inventory set %I = %I + %s where user_id = %L',
      v_potion_column, v_potion_column,
      (v_item.metadata->>'qty')::int, v_user_id
    );
  end if;

  -- 5. Log transaction
  insert into public.transactions (user_id, type, details)
  values (v_user_id, 'purchase', jsonb_build_object(
    'sku', item_sku,
    'bits_spent', v_item.price_bits,
    'new_balance', v_new_balance,
    'item_type', v_item.type
  ));

  return json_build_object('success', true, 'new_balance', v_new_balance);
end;
$$;
```

### 4.4 `grant_potion_drop`

Called by the client after a round to record a potion drop. Server validates and applies.

```sql
create or replace function public.grant_potion_drop(
  p_potion_column text,
  p_round_number int,
  p_rarity text
)
returns json
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_valid_columns text[] := array[
    'potion_time_freeze', 'potion_second_chance',
    'potion_heart_refill', 'potion_50_50',
    'potion_grid_skip', 'potion_revive',
    'potion_fortune_tonic', 'potion_scanner'
  ];
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Validate column name against whitelist (prevent injection)
  if not (p_potion_column = any(v_valid_columns)) then
    raise exception 'Invalid potion type: %', p_potion_column;
  end if;

  -- Grant potion
  execute format(
    'update public.inventory set %I = %I + 1 where user_id = %L',
    p_potion_column, p_potion_column, v_user_id
  );

  -- Log transaction
  insert into public.transactions (user_id, type, details)
  values (v_user_id, 'potion_drop', jsonb_build_object(
    'potion', p_potion_column,
    'round', p_round_number,
    'rarity', p_rarity
  ));

  return json_build_object('success', true, 'potion', p_potion_column);
end;
$$;
```

### 4.5 `consume_potion`

Called when a player uses a potion during a game session.

```sql
create or replace function public.consume_potion(p_potion_column text)
returns json
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_current_count int;
  v_valid_columns text[] := array[
    'potion_time_freeze', 'potion_second_chance',
    'potion_heart_refill', 'potion_50_50',
    'potion_grid_skip', 'potion_revive',
    'potion_fortune_tonic', 'potion_scanner'
  ];
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Validate column name against whitelist
  if not (p_potion_column = any(v_valid_columns)) then
    raise exception 'Invalid potion type: %', p_potion_column;
  end if;

  -- Check current count with lock
  execute format(
    'select %I from public.inventory where user_id = %L for update',
    p_potion_column, v_user_id
  ) into v_current_count;

  if v_current_count <= 0 then
    raise exception 'No potions of type % available', p_potion_column;
  end if;

  -- Deduct potion
  execute format(
    'update public.inventory set %I = %I - 1 where user_id = %L',
    p_potion_column, p_potion_column, v_user_id
  );

  -- Log transaction
  insert into public.transactions (user_id, type, details)
  values (v_user_id, 'potion_used', jsonb_build_object(
    'potion', p_potion_column
  ));

  return json_build_object('success', true, 'remaining', v_current_count - 1);
end;
$$;
```

### 4.6 `get_leaderboard`

Efficient paginated leaderboard query with player rank.

```sql
create or replace function public.get_leaderboard(
  p_mode text,
  p_country_code text default null,  -- null = global
  p_limit int default 100,
  p_offset int default 0
)
returns json
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_results json;
  v_player_rank int;
begin
  v_user_id := auth.uid();

  -- Get leaderboard page (best score per player)
  select json_agg(row_to_json(t)) into v_results
  from (
    select
      best.user_id,
      p.username,
      p.display_name,
      p.avatar_url,
      p.country_code,
      best.score,
      best.round_reached,
      best.played_at,
      row_number() over (order by best.score desc, best.played_at asc) as rank
    from (
      -- Best score per player for this mode
      select distinct on (s.user_id)
        s.user_id, s.score, s.round_reached, s.played_at
      from public.scores s
      where s.mode = p_mode
      order by s.user_id, s.score desc, s.played_at asc
    ) best
    join public.profiles p on p.id = best.user_id
    where (p_country_code is null or p.country_code = p_country_code)
    order by best.score desc, best.played_at asc
    limit p_limit offset p_offset
  ) t;

  -- Get current player's rank (based on their best score)
  select r.rank into v_player_rank
  from (
    select
      best.user_id,
      row_number() over (order by best.score desc, best.played_at asc) as rank
    from (
      select distinct on (s.user_id)
        s.user_id, s.score, s.played_at
      from public.scores s
      where s.mode = p_mode
      order by s.user_id, s.score desc, s.played_at asc
    ) best
    join public.profiles p on p.id = best.user_id
    where (p_country_code is null or p.country_code = p_country_code)
  ) r
  where r.user_id = v_user_id
  limit 1;

  return json_build_object(
    'leaderboard', coalesce(v_results, '[]'::json),
    'player_rank', v_player_rank
  );
end;
$$;
```

### 4.7 `delete_user_account`

Required for Apple App Store compliance (Guideline 5.1.1(v)). Deletes all user data. All tables use `ON DELETE CASCADE`, so deleting the profile row cascades to scores, inventory, and transactions.

**Note:** Deleting from `auth.users` requires the Supabase Admin API (service_role key). This should be called from a Supabase Edge Function, not directly from a Postgres RPC. The RPC below handles the `public` schema cleanup; the Edge Function handles the `auth.users` deletion.

```sql
-- Edge Function approach (recommended):
-- 1. Client calls Edge Function with auth token
-- 2. Edge Function verifies token, then:
--    a. Deletes from public.profiles (cascades to all related tables)
--    b. Calls supabase.auth.admin.deleteUser(user_id) to remove from auth.users
-- 3. Client clears local storage and navigates to /auth

-- Alternatively, a Postgres RPC for the public schema cleanup:
create or replace function public.delete_own_account()
returns json
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Delete profile (cascades to scores, inventory, transactions via ON DELETE CASCADE)
  delete from public.profiles where id = v_user_id;

  -- Note: auth.users row must be deleted via Supabase Admin API (Edge Function)
  -- This RPC only handles the public schema. The client should call the Edge Function
  -- which invokes this RPC + auth.admin.deleteUser().

  return json_build_object('success', true);
end;
$$;
```

---

## 5. Summary of Security Model

| Operation | Method | Why |
|---|---|---|
| Read profiles/scores/challenges/store | Direct SELECT via RLS | Public read is safe |
| Read own inventory/transactions | Direct SELECT via RLS | Scoped to own user |
| Submit game score | `submit_game_score` RPC | Server replays events, calculates score, prevents fake scores |
| Purchase item | `purchase_item_with_bits` RPC | Atomic balance check + deduction with `FOR UPDATE` lock |
| Earn bits | Part of `submit_game_score` RPC | Only granted alongside validated scores |
| Grant potion drop | `grant_potion_drop` RPC | Server validates potion type against whitelist |
| Use potion | `consume_potion` RPC | Server checks inventory count, prevents negative |
| Update profile (name, avatar) | Direct UPDATE via RLS | `bits` column protected by RLS check constraint |
| Delete account | `delete_own_account` RPC + Edge Function | Cascades via `ON DELETE CASCADE`. Auth deletion via Admin API. |
| Update inventory directly | **BLOCKED** | No client update policy. RPC only. |
| Insert scores directly | **BLOCKED** | No client insert policy. RPC only. |
