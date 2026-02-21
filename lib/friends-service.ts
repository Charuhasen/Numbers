import { supabase } from '@/lib/supabase';

type FriendshipStatus = 'pending' | 'accepted' | 'declined';

export interface FriendProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  countryCode?: string;
  classicBest?: number;
  blitzBest?: number;
}

export interface Friendship {
  id: string;
  status: FriendshipStatus;
  createdAt: string;
  friend: FriendProfile;
  isSender: boolean;
}

export interface SearchResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  allowFriendRequests: boolean;
  friendshipId?: string;
  relationshipStatus?: FriendshipStatus;
  isSender?: boolean;
}

// ─── RPC row shapes ──────────────────────────────────────────────────────────

interface RpcFriendRow {
  friendship_id: string;
  created_at: string;
  is_sender: boolean;
  friend_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  country_code: string | null;
  classic_best: number | null;
  blitz_best: number | null;
}

interface RpcRequestRow {
  friendship_id: string;
  created_at: string;
  is_sender: boolean;
  friend_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapFriendRow(row: RpcFriendRow): Friendship {
  return {
    id: row.friendship_id,
    status: 'accepted',
    createdAt: row.created_at,
    isSender: row.is_sender,
    friend: {
      id: row.friend_id,
      username: row.username ?? row.friend_id,
      displayName: row.display_name ?? row.username ?? row.friend_id,
      avatarUrl: row.avatar_url ?? undefined,
      countryCode: row.country_code ?? undefined,
      classicBest: row.classic_best ?? undefined,
      blitzBest: row.blitz_best ?? undefined,
    },
  };
}

function mapRequestRow(row: RpcRequestRow, status: FriendshipStatus): Friendship {
  return {
    id: row.friendship_id,
    status,
    createdAt: row.created_at,
    isSender: row.is_sender,
    friend: {
      id: row.friend_id,
      username: row.username ?? row.friend_id,
      displayName: row.display_name ?? row.username ?? row.friend_id,
      avatarUrl: row.avatar_url ?? undefined,
    },
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Search users by username (case-insensitive partial match).
 * Annotates each result with the existing friendship status if any.
 */
export async function searchUsers(query: string): Promise<SearchResult[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const trimmed = query.trim();
  if (!trimmed) return [];

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, allow_friend_requests')
    .ilike('username', `%${trimmed}%`)
    .neq('id', user.id)
    .limit(20);

  if (error) throw error;
  if (!profiles || profiles.length === 0) return [];

  // Fetch existing friendships involving the current user and the found profiles
  const profileIds = profiles.map((p: { id: string }) => p.id);
  const { data: friendships, error: friendshipsError } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, status')
    .or(
      `and(requester_id.eq.${user.id},addressee_id.in.(${profileIds.join(',')})),` +
      `and(addressee_id.eq.${user.id},requester_id.in.(${profileIds.join(',')}))`
    );

  if (friendshipsError) throw friendshipsError;

  const friendshipMap = new Map<
    string,
    { id: string; status: FriendshipStatus; isSender: boolean }
  >();

  for (const f of (friendships ?? [])) {
    const otherId = f.requester_id === user.id ? f.addressee_id : f.requester_id;
    friendshipMap.set(otherId, {
      id: f.id,
      status: f.status as FriendshipStatus,
      isSender: f.requester_id === user.id,
    });
  }

  return profiles.map((p: { id: string; username: string | null; display_name: string | null; avatar_url: string | null; allow_friend_requests: boolean }) => {
    const existing = friendshipMap.get(p.id);
    return {
      id: p.id,
      username: p.username ?? p.id,
      displayName: p.display_name ?? p.username ?? p.id,
      avatarUrl: p.avatar_url ?? undefined,
      allowFriendRequests: p.allow_friend_requests ?? false,
      friendshipId: existing?.id,
      relationshipStatus: existing?.status,
      isSender: existing?.isSender,
    };
  });
}

/** Send a friend request to the target user. */
export async function sendFriendRequest(targetUserId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('friendships').insert({
    requester_id: user.id,
    addressee_id: targetUserId,
    status: 'pending',
  });

  if (error) {
    if (error.message === 'rate_limit_exceeded') {
      throw new Error('You can only send 10 friend requests per hour.');
    }
    throw error;
  }
}

/** Accept or decline a pending incoming friend request. */
export async function respondToRequest(
  friendshipId: string,
  accept: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: accept ? 'accepted' : 'declined' })
    .eq('id', friendshipId);

  if (error) throw error;
}

/** Remove (delete) a friendship row — works whether accepted or pending. */
export async function removeFriendship(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId);

  if (error) throw error;
}

/** Get all accepted friends with their profile + best scores. Single RPC call. */
export async function getFriends(): Promise<Friendship[]> {
  const { data, error } = await supabase.rpc('get_friends');
  if (error) throw error;
  return ((data as RpcFriendRow[]) ?? []).map(mapFriendRow);
}

/** Get incoming (pending) friend requests addressed to the current user. Single RPC call. */
export async function getIncomingRequests(): Promise<Friendship[]> {
  const { data, error } = await supabase.rpc('get_incoming_requests');
  if (error) throw error;
  return ((data as RpcRequestRow[]) ?? []).map(row => mapRequestRow(row, 'pending'));
}

/** Get outgoing (pending) friend requests sent by the current user. Single RPC call. */
export async function getSentRequests(): Promise<Friendship[]> {
  const { data, error } = await supabase.rpc('get_sent_requests');
  if (error) throw error;
  return ((data as RpcRequestRow[]) ?? []).map(row => mapRequestRow(row, 'pending'));
}
