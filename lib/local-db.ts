import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabaseSync('taptapmath_local.db');

/**
 * Initializes the SQLite database exactly mirroring the relevant Supabase tables.
 * This is an exhaustive exact mirror of the tables required for offline play.
 */
export function initLocalDb() {
  db.execSync(`
    PRAGMA journal_mode = WAL;

    -- 1. profiles
    -- Exact mirror of public.profiles
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY NOT NULL, -- UUID mapped to TEXT
      username TEXT UNIQUE,
      display_name TEXT,
      bits INTEGER DEFAULT 0,
      avatar_url TEXT,
      country_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 2. inventory
    -- Exact mirror of public.inventory
    CREATE TABLE IF NOT EXISTS inventory (
      user_id TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      potion_time_freeze INTEGER DEFAULT 0,
      potion_second_chance INTEGER DEFAULT 0,
      potion_heart_refill INTEGER DEFAULT 0,
      potion_50_50 INTEGER DEFAULT 0,
      potion_grid_skip INTEGER DEFAULT 0,
      potion_scanner INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    -- 3. user_potion_slots
    -- Exact mirror of public.user_potion_slots
    CREATE TABLE IF NOT EXISTS user_potion_slots (
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      slot_index INTEGER NOT NULL CHECK (slot_index IN (1, 2, 3)),
      potion_type TEXT, -- sku string referencing store_items
      auto_use_enabled INTEGER DEFAULT 0, -- BOOLEAN mapped to INTEGER (0=false, 1=true)
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, slot_index)
    );

    -- 4. scores
    -- Exact mirror of public.scores. We add a 'sync_status' column for background syncing.
    -- We also add 'events_json' to keep the game replay payload needed for the RPC sync later.
    CREATE TABLE IF NOT EXISTS scores (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      score INTEGER NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('classic', 'blitz')),
      round_reached INTEGER NOT NULL,
      played_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed')),
      events_json TEXT,
      retry_count INTEGER DEFAULT 0,
      last_retry_at TEXT
    );

    -- 5. store_items
    -- Exact mirror of public.store_items. Pulled down when online for local display.
    CREATE TABLE IF NOT EXISTS store_items (
      id TEXT PRIMARY KEY NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price_bits INTEGER DEFAULT 0,
      price_fiat REAL, -- decimal mapped to REAL
      type TEXT NOT NULL CHECK (type IN ('potion', 'heart_refill', 'bundle', 'bits_pack')),
      metadata TEXT, -- JSONB mapped to TEXT
      is_active INTEGER DEFAULT 1,
      discount_percentage INTEGER DEFAULT 0,
      discount_ends_at TEXT,
      created_at TEXT NOT NULL
    );

    -- 6. transactions
    -- Exact mirror of public.transactions. We add a 'sync_status' for the local log.
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('purchase', 'bits_earned', 'potion_drop', 'potion_used')),
      details TEXT NOT NULL, -- JSONB mapped to TEXT
      created_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed'))
    );

    -- Sync Metadata (Local only table to track data sync timing)
    CREATE TABLE IF NOT EXISTS local_sync_meta (
      table_name TEXT PRIMARY KEY NOT NULL,
      last_synced_at TEXT NOT NULL
    );

    -- 7. game_sessions — replaces AsyncStorage for crash recovery
    CREATE TABLE IF NOT EXISTS game_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mode TEXT NOT NULL CHECK (mode IN ('classic', 'blitz')),
      score INTEGER NOT NULL DEFAULT 0,
      bits_earned INTEGER NOT NULL DEFAULT 0,
      challenge_index INTEGER NOT NULL DEFAULT 0,
      elapsed_seconds REAL NOT NULL DEFAULT 0,
      events_json TEXT NOT NULL DEFAULT '[]',
      session_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 8. leaderboard_cache — persists leaderboard data across sessions
    CREATE TABLE IF NOT EXISTS leaderboard_cache (
      cache_key TEXT PRIMARY KEY NOT NULL,
      result_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    -- 9. pending_changes — queues offline profile/settings/slot mutations
    CREATE TABLE IF NOT EXISTS pending_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      change_type TEXT NOT NULL CHECK (change_type IN ('username', 'friend_requests_toggle', 'potion_slot')),
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed'))
    );
  `);

  // Migration-safe: add retry columns to scores if they don't exist yet
  migrateScoresRetryColumns();

  // Create indexes for common queries
  createIndexes();
}

function migrateScoresRetryColumns() {
  const cols = db.getAllSync<{ name: string }>(`PRAGMA table_info(scores)`);
  const colNames = new Set(cols.map(c => c.name));

  if (!colNames.has('retry_count')) {
    db.runSync(`ALTER TABLE scores ADD COLUMN retry_count INTEGER DEFAULT 0`);
  }
  if (!colNames.has('last_retry_at')) {
    db.runSync(`ALTER TABLE scores ADD COLUMN last_retry_at TEXT`);
  }
}

function createIndexes() {
  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_scores_sync ON scores(sync_status);
    CREATE INDEX IF NOT EXISTS idx_tx_sync ON transactions(sync_status);
    CREATE INDEX IF NOT EXISTS idx_scores_user ON scores(user_id);
    CREATE INDEX IF NOT EXISTS idx_scores_best ON scores(user_id, mode, score);
    CREATE INDEX IF NOT EXISTS idx_pending_changes_sync ON pending_changes(sync_status);
  `);
}

// Automatically initialize the DB tables as soon as this module is imported.
// This prevents race conditions where React components render and try to read
// tables before a context provider's useEffect has a chance to create them.
initLocalDb();

// ─── Profile Queries ─────────────────────────────────────────────────────────

export interface LocalProfile {
  id: string;
  username: string;
  display_name: string;
  bits: number;
  avatar_url: string;
  country_code: string;
}

export function getLocalProfile(userId: string): LocalProfile | null {
  return db.getFirstSync<LocalProfile>(`SELECT * FROM profiles WHERE id = ?`, [userId]);
}

export function upsertLocalProfile(profile: LocalProfile) {
  db.runSync(`
    INSERT INTO profiles (id, username, display_name, bits, avatar_url, country_code, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      display_name = excluded.display_name,
      bits = excluded.bits,
      avatar_url = excluded.avatar_url,
      country_code = excluded.country_code,
      updated_at = datetime('now')
  `, [
    profile.id, profile.username, profile.display_name, profile.bits,
    profile.avatar_url, profile.country_code,
  ]);
}

// ─── Inventory Queries ───────────────────────────────────────────────────────

export interface LocalInventory {
  user_id: string;
  potion_time_freeze: number;
  potion_second_chance: number;
  potion_heart_refill: number;
  potion_50_50: number;
  potion_grid_skip: number;
  potion_scanner: number;
}

export function getLocalInventory(userId: string): LocalInventory | null {
  return db.getFirstSync<LocalInventory>(`SELECT * FROM inventory WHERE user_id = ?`, [userId]);
}

export function upsertLocalInventory(inventory: LocalInventory) {
  db.runSync(`
    INSERT INTO inventory (
      user_id, potion_time_freeze, potion_second_chance, potion_heart_refill,
      potion_50_50, potion_grid_skip, potion_scanner,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      potion_time_freeze = excluded.potion_time_freeze,
      potion_second_chance = excluded.potion_second_chance,
      potion_heart_refill = excluded.potion_heart_refill,
      potion_50_50 = excluded.potion_50_50,
      potion_grid_skip = excluded.potion_grid_skip,
      potion_scanner = excluded.potion_scanner,
      updated_at = datetime('now')
  `, [
    inventory.user_id,
    inventory.potion_time_freeze ?? 0,
    inventory.potion_second_chance ?? 0,
    inventory.potion_heart_refill ?? 0,
    inventory.potion_50_50 ?? 0,
    inventory.potion_grid_skip ?? 0,
    inventory.potion_scanner ?? 0,
  ]);
}

export function consumeLocalPotion(userId: string, potionColumn: keyof LocalInventory) {
  db.runSync(`UPDATE inventory SET ${potionColumn} = ${potionColumn} - 1, updated_at = datetime('now') WHERE user_id = ? AND ${potionColumn} > 0`, [userId]);
}

// ─── Potion Slots Queries ────────────────────────────────────────────────────

export interface LocalPotionSlot {
  user_id: string;
  slot_index: number;
  potion_type: string | null;
  auto_use_enabled: boolean;
}

export function getLocalPotionSlots(userId: string): LocalPotionSlot[] {
  const rows = db.getAllSync<any>(`SELECT * FROM user_potion_slots WHERE user_id = ? ORDER BY slot_index ASC`, [userId]);
  return rows.map(r => ({ ...r, auto_use_enabled: r.auto_use_enabled === 1 }));
}

export function upsertLocalPotionSlots(slots: LocalPotionSlot[]) {
  for (const slot of slots) {
    db.runSync(`
      INSERT INTO user_potion_slots (user_id, slot_index, potion_type, auto_use_enabled, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, slot_index) DO UPDATE SET
        potion_type = excluded.potion_type,
        auto_use_enabled = excluded.auto_use_enabled,
        updated_at = datetime('now')
    `, [slot.user_id, slot.slot_index, slot.potion_type, slot.auto_use_enabled ? 1 : 0]);
  }
}

export function deleteLocalPotionSlot(userId: string, slotIndex: number) {
  db.runSync(`DELETE FROM user_potion_slots WHERE user_id = ? AND slot_index = ?`, [userId, slotIndex]);
}

// ─── Score Queries ───────────────────────────────────────────────────────────

export interface LocalScore {
  id: string;
  user_id: string;
  score: number;
  mode: 'classic' | 'blitz';
  round_reached: number;
  played_at: string;
  sync_status: 'pending' | 'synced' | 'failed';
  events_json: string;
  retry_count: number;
  last_retry_at: string | null;
}

export function insertLocalScore(score: Omit<LocalScore, 'retry_count' | 'last_retry_at'>) {
  db.runSync(`
    INSERT INTO scores (id, user_id, score, mode, round_reached, played_at, sync_status, events_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    score.id, score.user_id, score.score, score.mode, score.round_reached, score.played_at, score.sync_status, score.events_json
  ]);
}

export function upsertLocalScore(score: { id: string; user_id: string; score: number; mode: string; round_reached: number; played_at: string }) {
  db.runSync(`
    INSERT INTO scores (id, user_id, score, mode, round_reached, played_at, sync_status)
    VALUES (?, ?, ?, ?, ?, ?, 'synced')
    ON CONFLICT(id) DO UPDATE SET
      score = excluded.score,
      round_reached = excluded.round_reached,
      sync_status = 'synced'
  `, [score.id, score.user_id, score.score, score.mode, score.round_reached, score.played_at]);
}

export function getPendingScores(userId: string): LocalScore[] {
  return db.getAllSync<LocalScore>(`SELECT * FROM scores WHERE user_id = ? AND sync_status = 'pending'`, [userId]);
}

/** Get scores eligible for retry: pending, retry_count < 5, and respecting exponential backoff timing. */
export function getRetryableScores(userId: string): LocalScore[] {
  return db.getAllSync<LocalScore>(`
    SELECT * FROM scores
    WHERE user_id = ?
      AND sync_status = 'pending'
      AND retry_count < 5
      AND (
        last_retry_at IS NULL
        OR (julianday('now') - julianday(last_retry_at)) * 86400000 > (1 << retry_count) * 60000
      )
    ORDER BY played_at ASC
  `, [userId]);
}

export function incrementScoreRetry(scoreId: string) {
  db.runSync(`UPDATE scores SET retry_count = retry_count + 1, last_retry_at = datetime('now') WHERE id = ?`, [scoreId]);
}

export function markScoreFailed(scoreId: string) {
  db.runSync(`UPDATE scores SET sync_status = 'failed' WHERE id = ?`, [scoreId]);
}

export function markScoreSynced(scoreId: string) {
  db.runSync(`UPDATE scores SET sync_status = 'synced' WHERE id = ?`, [scoreId]);
}

/** Check if a similar score already exists (dedup within 1-minute window). */
export function scoreExistsNear(userId: string, mode: string, score: number, playedAt: string): boolean {
  const row = db.getFirstSync<{ cnt: number }>(`
    SELECT COUNT(*) as cnt FROM scores
    WHERE user_id = ? AND mode = ? AND score = ?
      AND ABS(julianday(played_at) - julianday(?)) * 86400 < 60
  `, [userId, mode, score, playedAt]);
  return (row?.cnt ?? 0) > 0;
}

/** Get the user's local best scores per mode. */
export function getLocalBestScores(userId: string): { classic: number; blitz: number } {
  const classic = db.getFirstSync<{ best: number | null }>(
    `SELECT MAX(score) as best FROM scores WHERE user_id = ? AND mode = 'classic'`, [userId]
  );
  const blitz = db.getFirstSync<{ best: number | null }>(
    `SELECT MAX(score) as best FROM scores WHERE user_id = ? AND mode = 'blitz'`, [userId]
  );
  return {
    classic: classic?.best ?? 0,
    blitz: blitz?.best ?? 0,
  };
}

// ─── Store Items Queries ───────────────────────────────────────────────────────

export interface LocalStoreItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  price_bits: number;
  price_fiat: number | null;
  type: 'potion' | 'bundle' | 'bits_pack';
  metadata: string | null; // JSON string
  is_active: boolean; // boolean, stored as integer
  discount_percentage: number;
  discount_ends_at: string | null;
  created_at: string;
}

export function getLocalStoreItems(): LocalStoreItem[] {
  const rows = db.getAllSync<any>(`SELECT * FROM store_items WHERE is_active = 1 ORDER BY price_bits ASC`);
  return rows.map(r => ({
    ...r,
    is_active: r.is_active === 1,
  })) as LocalStoreItem[];
}

export function upsertLocalStoreItems(items: LocalStoreItem[]) {
  // Guard: don't wipe the store cache if server returned empty array
  if (items.length === 0) return;

  db.withTransactionSync(() => {
    const placeholders = items.map(() => '?').join(',');
    db.runSync(`DELETE FROM store_items WHERE id NOT IN (${placeholders})`, items.map(i => i.id));

    for (const item of items) {
      db.runSync(`
        INSERT INTO store_items (
          id, sku, name, description, price_bits, price_fiat, type, metadata,
          is_active, discount_percentage, discount_ends_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          sku = excluded.sku,
          name = excluded.name,
          description = excluded.description,
          price_bits = excluded.price_bits,
          price_fiat = excluded.price_fiat,
          type = excluded.type,
          metadata = excluded.metadata,
          is_active = excluded.is_active,
          discount_percentage = excluded.discount_percentage,
          discount_ends_at = excluded.discount_ends_at
      `, [
        item.id,
        item.sku,
        item.name,
        item.description,
        item.price_bits,
        item.price_fiat,
        item.type,
        item.metadata,
        item.is_active ? 1 : 0,
        item.discount_percentage,
        item.discount_ends_at,
        item.created_at
      ]);
    }
  });
}

// ─── Transaction Queries ─────────────────────────────────────────────────────

export interface LocalTransaction {
  id: string;
  user_id: string;
  type: 'purchase' | 'bits_earned' | 'potion_drop' | 'potion_used';
  details: string; // JSON string
  created_at: string;
  sync_status: 'pending' | 'synced' | 'failed';
}

export function insertLocalTransaction(tx: LocalTransaction) {
  // Validate required fields and JSON details before inserting
  if (!tx.id || !tx.user_id || !tx.type) {
    console.error('insertLocalTransaction: missing required fields', { id: tx.id, user_id: tx.user_id, type: tx.type });
    return;
  }
  try {
    JSON.parse(tx.details);
  } catch {
    console.error('insertLocalTransaction: invalid JSON in details', tx.details);
    return;
  }

  db.runSync(`
    INSERT INTO transactions (id, user_id, type, details, created_at, sync_status)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [tx.id, tx.user_id, tx.type, tx.details, tx.created_at, tx.sync_status]);
}

export function getPendingTransactions(userId: string): LocalTransaction[] {
  return db.getAllSync<LocalTransaction>(`SELECT * FROM transactions WHERE user_id = ? AND sync_status = 'pending'`, [userId]);
}

export function markTransactionSynced(txId: string) {
  db.runSync(`UPDATE transactions SET sync_status = 'synced' WHERE id = ?`, [txId]);
}

// ─── Game Session Queries (crash recovery) ──────────────────────────────────

export interface LocalGameSession {
  id: number;
  mode: 'classic' | 'blitz';
  score: number;
  bits_earned: number;
  challenge_index: number;
  elapsed_seconds: number;
  events_json: string;
  session_id: string | null;
  created_at: string;
  updated_at: string;
}

export function upsertGameSession(data: Omit<LocalGameSession, 'id' | 'created_at' | 'updated_at'>) {
  // Always keep exactly one active session — delete any existing, then insert
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM game_sessions`);
    db.runSync(`
      INSERT INTO game_sessions (mode, score, bits_earned, challenge_index, elapsed_seconds, events_json, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [data.mode, data.score, data.bits_earned, data.challenge_index, data.elapsed_seconds, data.events_json, data.session_id]);
  });
}

export function getActiveGameSession(): LocalGameSession | null {
  return db.getFirstSync<LocalGameSession>(`SELECT * FROM game_sessions ORDER BY id DESC LIMIT 1`);
}

export function clearGameSession() {
  db.runSync(`DELETE FROM game_sessions`);
}

// ─── Leaderboard Cache Queries ──────────────────────────────────────────────

export function getLeaderboardCache(key: string): { result_json: string; fetched_at: string } | null {
  return db.getFirstSync<{ result_json: string; fetched_at: string }>(
    `SELECT result_json, fetched_at FROM leaderboard_cache WHERE cache_key = ?`, [key]
  );
}

export function upsertLeaderboardCache(key: string, resultJson: string) {
  db.runSync(`
    INSERT INTO leaderboard_cache (cache_key, result_json, fetched_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(cache_key) DO UPDATE SET
      result_json = excluded.result_json,
      fetched_at = datetime('now')
  `, [key, resultJson]);
}

// ─── Pending Changes Queries ────────────────────────────────────────────────

export type PendingChangeType = 'username' | 'friend_requests_toggle' | 'potion_slot';

export interface PendingChange {
  id: number;
  change_type: PendingChangeType;
  payload: string; // JSON string
  created_at: string;
  sync_status: 'pending' | 'synced' | 'failed';
}

export function insertPendingChange(changeType: PendingChangeType, payload: object) {
  db.runSync(`
    INSERT INTO pending_changes (change_type, payload)
    VALUES (?, ?)
  `, [changeType, JSON.stringify(payload)]);
}

export function getPendingChanges(): PendingChange[] {
  return db.getAllSync<PendingChange>(`SELECT * FROM pending_changes WHERE sync_status = 'pending' ORDER BY id ASC`);
}

export function markChangesSynced(ids: number[]) {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  db.runSync(`UPDATE pending_changes SET sync_status = 'synced' WHERE id IN (${placeholders})`, ids);
}

// ─── Maintenance ────────────────────────────────────────────────────────────

/** Delete synced scores and transactions older than 30 days. */
export function pruneSyncedData() {
  db.execSync(`
    DELETE FROM scores WHERE sync_status = 'synced' AND julianday('now') - julianday(played_at) > 30 AND id NOT IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, mode ORDER BY score DESC) as rn
        FROM scores
      ) WHERE rn = 1
    );
    DELETE FROM transactions WHERE sync_status = 'synced' AND julianday('now') - julianday(created_at) > 30;
    DELETE FROM pending_changes WHERE sync_status = 'synced' AND julianday('now') - julianday(created_at) > 7;
  `);
}
