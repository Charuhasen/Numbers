import { useSession } from '@/context/ctx';
import { clearGameSessionData, getGameSessionData } from '@/lib/game-session-store';
import { processPendingScores, queuePendingScore } from '@/lib/score-service';
import { supabase } from '@/lib/supabase';
import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';

export interface Profile {
  id: string;
  username: string | null;
  displayName: string | null;
  bits: number;
  avatarUrl: string | null;
  countryCode: string | null;
  allowFriendRequests: boolean;
}

export interface BestScores {
  classic: number;
  blitz: number;
}

export interface Inventory {
  potion_time_freeze: number;
  potion_second_chance: number;
  potion_heart_refill: number;
  potion_50_50: number;
  potion_grid_skip: number;
  potion_revive: number;
  potion_fortune_tonic: number;
  potion_scanner: number;
}

export interface UserPotionSlot {
  slot_index: number;
  potion_type: string | null;
  auto_use_enabled: boolean;
}

const emptyBestScores = (): BestScores => ({
  classic: 0,
  blitz: 0,
});

interface ProfileContextValue {
  profile: Profile | null;
  bestScores: BestScores;
  inventory: Inventory | null;
  potionSlots: UserPotionSlot[];
  isLoading: boolean;
  refreshProfile: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue>({
  profile: null,
  bestScores: emptyBestScores(),
  inventory: null,
  potionSlots: [],
  isLoading: true,
  refreshProfile: async () => {},
});

export function useProfile() {
  return useContext(ProfileContext);
}

export function ProfileProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bestScores, setBestScores] = useState<BestScores>(emptyBestScores());
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [potionSlots, setPotionSlots] = useState<UserPotionSlot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!session?.user?.id) {
      setProfile(null);
      setBestScores(emptyBestScores());
      setInventory(null);
      setPotionSlots([]);
      setIsLoading(false);
      return;
    }

    const userId = session.user.id;

    // Fetch profile
    let profileResult = await supabase
      .from('profiles')
      .select('id, username, display_name, bits, avatar_url, country_code, allow_friend_requests')
      .eq('id', userId)
      .single();

    // Safety net: create profile if trigger didn't fire (e.g. pre-existing user)
    if (!profileResult.data) {
      const meta = session.user.user_metadata;
      const displayName = meta?.full_name ?? meta?.name ?? session.user.email?.split('@')[0] ?? null;
      await supabase.from('profiles').insert({
        id: userId,
        username: null,
        display_name: displayName,
        avatar_url: meta?.avatar_url ?? null,
      });
      // Also ensure inventory exists
      await supabase.from('inventory').insert({ user_id: userId });
      // Re-fetch after creation
      profileResult = await supabase
        .from('profiles')
        .select('id, username, display_name, bits, avatar_url, country_code, allow_friend_requests')
        .eq('id', userId)
        .single();
    }

    if (profileResult.data) {
      setProfile({
        id: profileResult.data.id,
        username: profileResult.data.username,
        displayName: profileResult.data.display_name,
        bits: profileResult.data.bits ?? 0,
        avatarUrl: profileResult.data.avatar_url,
        countryCode: profileResult.data.country_code ?? null,
        allowFriendRequests: profileResult.data.allow_friend_requests ?? false,
      });
    }

    // Fetch best scores per mode (max across all difficulties)
    const scoresResult = await supabase
      .from('scores')
      .select('mode, score')
      .eq('user_id', userId);

    if (scoresResult.data) {
      const best: BestScores = emptyBestScores();
      for (const row of scoresResult.data) {
        const mode = row.mode as keyof BestScores;
        if (mode in best && row.score > best[mode]) {
          best[mode] = row.score;
        }
      }
      setBestScores(best);
    }

    // Fetch Inventory
    const inventoryResult = await supabase
      .from('inventory')
      .select('potion_time_freeze, potion_second_chance, potion_heart_refill, potion_50_50, potion_grid_skip, potion_revive, potion_fortune_tonic, potion_scanner')
      .eq('user_id', userId)
      .single();

    if (inventoryResult.data) {
      setInventory(inventoryResult.data as unknown as Inventory);
    } else {
      setInventory(null);
    }

    // Fetch Potion Slots
    const slotsResult = await supabase
      .from('user_potion_slots')
      .select('slot_index, potion_type, auto_use_enabled')
      .eq('user_id', userId);

    if (slotsResult.data) {
      setPotionSlots(slotsResult.data as UserPotionSlot[]);
    } else {
      setPotionSlots([]);
    }

    setIsLoading(false);
  }, [session?.user?.id]);

  // Fetch on mount / session change, and flush pending scores
  useEffect(() => {
    if (!session?.user?.id) {
      setProfile(null);
      setBestScores(emptyBestScores());
      setInventory(null);
      setPotionSlots([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    let cancelled = false;

    (async () => {
      // If the app was killed after a game ended but before the game-over screen
      // could submit, a stale session will be in AsyncStorage. Move it to the
      // pending queue so it gets submitted on this startup.
      const staleSession = await getGameSessionData();
      if (staleSession) {
        await queuePendingScore({
          mode: staleSession.mode,
          events: staleSession.events,
          roundReached: staleSession.challengeIndex,
          sessionId: staleSession.sessionId ?? null,
        });
        await clearGameSessionData();
      }

      // Flush any scores queued while offline
      await processPendingScores();
      if (!cancelled) await fetchProfile();
    })();

    return () => { cancelled = true; };
  }, [session?.user?.id, fetchProfile]);

  return (
    <ProfileContext.Provider
      value={{
        profile,
        bestScores,
        inventory,
        potionSlots,
        isLoading,
        refreshProfile: fetchProfile,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}
