import { supabase } from '@/lib/supabase';
import type { FriendProfile } from '@/lib/friends-service';

export type LeaderboardMode = 'classic' | 'blitz';
export type LeaderboardScope = 'global' | 'regional' | 'friends';

// ---------------------------------------------------------------------------
// Module-level TTL cache — survives tab switches, cleared on pull-to-refresh
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  result: LeaderboardResult;
  fetchedAt: number;
}

const _cache = new Map<string, CacheEntry>();

function cacheKey(mode: LeaderboardMode, countryCode: string | null): string {
  return countryCode ? `${mode}:${countryCode}` : mode;
}

function isFresh(key: string): boolean {
  const entry = _cache.get(key);
  return !!entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

/** Returns true if the cached result for the given scope is still within TTL. */
export function isLeaderboardFresh(
  mode: LeaderboardMode,
  countryCode: string | null = null,
): boolean {
  return isFresh(cacheKey(mode, countryCode));
}

/** Returns the Date when the given scope was last fetched, or null if never. */
export function getLeaderboardFetchedAt(
  mode: LeaderboardMode,
  countryCode: string | null = null,
): Date | null {
  const entry = _cache.get(cacheKey(mode, countryCode));
  return entry ? new Date(entry.fetchedAt) : null;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  countryCode?: string;
  score: number;
  rank: number;
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  playerRank: number | null;
}

interface RpcRow {
  user_id: string;
  username: string | null;
  display_name: string | null;
  country_code: string | null;
  score: number;
  rank: number;
}

function mapRow(row: RpcRow): LeaderboardEntry {
  return {
    userId: row.user_id,
    username: row.username ?? row.display_name ?? row.user_id,
    countryCode: row.country_code ?? undefined,
    score: row.score,
    rank: row.rank,
  };
}

/** Fetch global leaderboard (all countries) for the given mode. */
export async function fetchGlobalLeaderboard(
  mode: LeaderboardMode,
  limit = 100,
): Promise<LeaderboardResult> {
  const key = cacheKey(mode, null);

  if (isFresh(key)) {
    return _cache.get(key)!.result;
  }

  const { data, error } = await supabase.rpc('get_leaderboard', {
    p_mode: mode,
    p_country_code: null,
    p_limit: limit,
    p_offset: 0,
  });

  if (error) throw error;

  const rows: RpcRow[] = data?.leaderboard ?? [];
  const result: LeaderboardResult = {
    entries: rows.map(mapRow),
    playerRank: data?.player_rank ?? null,
  };

  _cache.set(key, { result, fetchedAt: Date.now() });
  return result;
}

/** Fetch regional leaderboard filtered by country code. */
export async function fetchRegionalLeaderboard(
  mode: LeaderboardMode,
  countryCode: string,
  limit = 100,
): Promise<LeaderboardResult> {
  const key = cacheKey(mode, countryCode);

  if (isFresh(key)) {
    return _cache.get(key)!.result;
  }

  const { data, error } = await supabase.rpc('get_leaderboard', {
    p_mode: mode,
    p_country_code: countryCode,
    p_limit: limit,
    p_offset: 0,
  });

  if (error) throw error;

  const rows: RpcRow[] = data?.leaderboard ?? [];
  const result: LeaderboardResult = {
    entries: rows.map(mapRow),
    playerRank: data?.player_rank ?? null,
  };

  _cache.set(key, { result, fetchedAt: Date.now() });
  return result;
}

/**
 * Build a client-side friends leaderboard.
 * Combines the current user with accepted friends, sorts by score for the given mode.
 */
export function buildFriendsLeaderboard(
  mode: LeaderboardMode,
  friends: FriendProfile[],
  currentUserId: string,
  currentUsername: string | null,
  currentUserScore: number,
  currentUserCountryCode?: string,
): LeaderboardResult {
  type Entry = { userId: string; username: string; countryCode?: string; score: number };

  const all: Entry[] = [
    {
      userId: currentUserId,
      username: currentUsername ?? currentUserId,
      countryCode: currentUserCountryCode,
      score: currentUserScore,
    },
    ...friends.map((f) => ({
      userId: f.id,
      username: f.username,
      countryCode: f.countryCode,
      score: (mode === 'classic' ? f.classicBest : f.blitzBest) ?? 0,
    })),
  ];

  // Sort descending by score
  all.sort((a, b) => b.score - a.score);

  const entries: LeaderboardEntry[] = all.map((e, i) => ({
    ...e,
    rank: i + 1,
  }));

  const playerEntry = entries.find((e) => e.userId === currentUserId);

  return {
    entries,
    playerRank: playerEntry?.rank ?? null,
  };
}

