import { getLocales } from 'expo-localization';

import { supabase } from '@/lib/supabase';
import type { FriendProfile } from '@/lib/friends-service';

export type LeaderboardMode = 'classic' | 'blitz';
export type LeaderboardScope = 'global' | 'regional' | 'friends';

export interface LeaderboardEntry {
  userId: string;
  username: string;
  avatarUrl?: string;
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
  avatar_url: string | null;
  score: number;
  rank: number;
}

function mapRow(row: RpcRow): LeaderboardEntry {
  return {
    userId: row.user_id,
    username: row.username ?? row.display_name ?? row.user_id,
    avatarUrl: row.avatar_url ?? undefined,
    score: row.score,
    rank: row.rank,
  };
}

/** Fetch global leaderboard (all countries) for the given mode. */
export async function fetchGlobalLeaderboard(
  mode: LeaderboardMode,
  limit = 100,
): Promise<LeaderboardResult> {
  const { data, error } = await supabase.rpc('get_leaderboard', {
    p_mode: mode,
    p_country_code: null,
    p_limit: limit,
    p_offset: 0,
  });

  if (error) throw error;

  const rows: RpcRow[] = data?.leaderboard ?? [];
  return {
    entries: rows.map(mapRow),
    playerRank: data?.player_rank ?? null,
  };
}

/** Fetch regional leaderboard filtered by country code. */
export async function fetchRegionalLeaderboard(
  mode: LeaderboardMode,
  countryCode: string,
  limit = 100,
): Promise<LeaderboardResult> {
  const { data, error } = await supabase.rpc('get_leaderboard', {
    p_mode: mode,
    p_country_code: countryCode,
    p_limit: limit,
    p_offset: 0,
  });

  if (error) throw error;

  const rows: RpcRow[] = data?.leaderboard ?? [];
  return {
    entries: rows.map(mapRow),
    playerRank: data?.player_rank ?? null,
  };
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
  avatarUrl?: string,
): LeaderboardResult {
  type Entry = { userId: string; username: string; avatarUrl?: string; score: number };

  const all: Entry[] = [
    {
      userId: currentUserId,
      username: currentUsername ?? currentUserId,
      avatarUrl,
      score: currentUserScore,
    },
    ...friends.map((f) => ({
      userId: f.id,
      username: f.username,
      avatarUrl: f.avatarUrl,
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

/**
 * Detect device region code and persist it to the user's profile.
 * Fire-and-forget: does not throw on failure.
 * Returns the detected code or null.
 */
export function detectAndPersistCountryCode(userId: string): string | null {
  const regionCode = getLocales()[0]?.regionCode ?? null;
  if (regionCode) {
    // Fire-and-forget update — do not await
    supabase
      .from('profiles')
      .update({ country_code: regionCode })
      .eq('id', userId)
      .then(() => {/* ignore */});
  }
  return regionCode;
}
