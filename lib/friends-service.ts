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

/** Get all accepted friends with their profile + best scores. */
export async function getFriends(): Promise<Friendship[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Fetch all friendships using pagination to bypass 1,000 row limits
  let allFriendships: any[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('friendships')
      .select('id, requester_id, addressee_id, status, created_at')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    if (data && data.length > 0) {
      allFriendships = allFriendships.concat(data);
      offset += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  if (allFriendships.length === 0) return [];

  const friendIds = allFriendships.map(f =>
    f.requester_id === user.id ? f.addressee_id : f.requester_id
  );

  // Chunk array to prevent URI Too Long errors when using .in()
  const CHUNK_SIZE = 100;
  const chunkedIds = [];
  for (let i = 0; i < friendIds.length; i += CHUNK_SIZE) {
    chunkedIds.push(friendIds.slice(i, i + CHUNK_SIZE));
  }

  const [profilesResult, scoresResult] = await Promise.all([
    // Fetch profiles in chunks
    Promise.all(chunkedIds.map(chunk =>
      supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, country_code')
        .in('id', chunk)
    )),
    // Fetch scores in chunks
    Promise.all(chunkedIds.map(chunk =>
      supabase
        .from('scores')
        .select('user_id, mode, score')
        .in('user_id', chunk)
    ))
  ]);

  // Check for errors in any chunk
  for (const res of profilesResult) if (res.error) throw res.error;
  for (const res of scoresResult) if (res.error) throw res.error;

  const allProfiles = profilesResult.flatMap(res => res.data || []);
  const allScores = scoresResult.flatMap(res => res.data || []);

  const profileMap = new Map<string, { id: string; username: string | null; display_name: string | null; avatar_url: string | null; country_code: string | null }>();
  for (const p of allProfiles) {
    profileMap.set(p.id, p);
  }

  // Aggregate best scores per friend per mode
  const bestScores = new Map<string, { classic: number; blitz: number }>();
  for (const s of allScores) {
    const entry = bestScores.get(s.user_id) ?? { classic: 0, blitz: 0 };
    if (s.mode === 'classic' && s.score > entry.classic) entry.classic = s.score;
    if (s.mode === 'blitz' && s.score > entry.blitz) entry.blitz = s.score;
    bestScores.set(s.user_id, entry);
  }

  return allFriendships.map((f: { id: string; requester_id: string; addressee_id: string; status: string; created_at: string }) => {
    const friendId = f.requester_id === user.id ? f.addressee_id : f.requester_id;
    const profile = profileMap.get(friendId);
    const scores = bestScores.get(friendId);
    return {
      id: f.id,
      status: f.status as FriendshipStatus,
      createdAt: f.created_at,
      isSender: f.requester_id === user.id,
      friend: {
        id: friendId,
        username: profile?.username ?? friendId,
        displayName: profile?.display_name ?? profile?.username ?? friendId,
        avatarUrl: profile?.avatar_url ?? undefined,
        countryCode: profile?.country_code ?? undefined,
        classicBest: scores?.classic,
        blitzBest: scores?.blitz,
      },
    };
  });
}

/** Get incoming (pending) friend requests addressed to the current user. */
export async function getIncomingRequests(): Promise<Friendship[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  let allRequests: any[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('friendships')
      .select('id, requester_id, created_at')
      .eq('addressee_id', user.id)
      .eq('status', 'pending')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    if (data && data.length > 0) {
      allRequests = allRequests.concat(data);
      offset += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  if (allRequests.length === 0) return [];

  const requesterIds = allRequests.map(f => f.requester_id);

  const CHUNK_SIZE = 100;
  const chunkedIds = [];
  for (let i = 0; i < requesterIds.length; i += CHUNK_SIZE) {
    chunkedIds.push(requesterIds.slice(i, i + CHUNK_SIZE));
  }

  const profilesResult = await Promise.all(
    chunkedIds.map(chunk =>
      supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', chunk)
    )
  );

  for (const res of profilesResult) if (res.error) throw res.error;
  const allProfiles = profilesResult.flatMap(res => res.data || []);

  const profileMap = new Map<string, { id: string; username: string | null; display_name: string | null; avatar_url: string | null }>();
  for (const p of allProfiles) profileMap.set(p.id, p);

  return allRequests.map((f: { id: string; requester_id: string; created_at: string }) => {
    const profile = profileMap.get(f.requester_id);
    return {
      id: f.id,
      status: 'pending' as FriendshipStatus,
      createdAt: f.created_at,
      isSender: false,
      friend: {
        id: f.requester_id,
        username: profile?.username ?? f.requester_id,
        displayName: profile?.display_name ?? profile?.username ?? f.requester_id,
        avatarUrl: profile?.avatar_url ?? undefined,
      },
    };
  });
}

/** Get outgoing (pending) friend requests sent by the current user. */
export async function getSentRequests(): Promise<Friendship[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  let allRequests: any[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('friendships')
      .select('id, addressee_id, created_at')
      .eq('requester_id', user.id)
      .eq('status', 'pending')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    if (data && data.length > 0) {
      allRequests = allRequests.concat(data);
      offset += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  if (allRequests.length === 0) return [];

  const addresseeIds = allRequests.map(f => f.addressee_id);

  const CHUNK_SIZE = 100;
  const chunkedIds = [];
  for (let i = 0; i < addresseeIds.length; i += CHUNK_SIZE) {
    chunkedIds.push(addresseeIds.slice(i, i + CHUNK_SIZE));
  }

  const profilesResult = await Promise.all(
    chunkedIds.map(chunk =>
      supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', chunk)
    )
  );

  for (const res of profilesResult) if (res.error) throw res.error;
  const allProfiles = profilesResult.flatMap(res => res.data || []);

  const profileMap = new Map<string, { id: string; username: string | null; display_name: string | null; avatar_url: string | null }>();
  for (const p of allProfiles) profileMap.set(p.id, p);

  return allRequests.map((f: { id: string; addressee_id: string; created_at: string }) => {
    const profile = profileMap.get(f.addressee_id);
    return {
      id: f.id,
      status: 'pending' as FriendshipStatus,
      createdAt: f.created_at,
      isSender: true,
      friend: {
        id: f.addressee_id,
        username: profile?.username ?? f.addressee_id,
        displayName: profile?.display_name ?? profile?.username ?? f.addressee_id,
        avatarUrl: profile?.avatar_url ?? undefined,
      },
    };
  });
}
