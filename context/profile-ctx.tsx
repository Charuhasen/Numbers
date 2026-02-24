import { useSession } from '@/context/ctx';
import { clearGameSessionData, getGameSessionData } from '@/lib/game-session-store';
import { getLocalBestScores, getLocalInventory, getLocalPotionSlots, getLocalProfile, scoreExistsNear } from '@/lib/local-db';
import { queuePendingScore } from '@/lib/score-service';
import { supabase } from '@/lib/supabase';
import { syncDataWithSupabase } from '@/lib/sync-service';
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
  potion_50_50: number;
  potion_grid_skip: number;
  potion_scanner: number;
}

export interface UserPotionSlot {
  slot_index: number;
  potion_type: string | null;
  auto_use_enabled: boolean;
  quantity: number;
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
  setPotionSlotsOptimistic: (slots: UserPotionSlot[]) => void;
}

const ProfileContext = createContext<ProfileContextValue>({
  profile: null,
  bestScores: emptyBestScores(),
  inventory: null,
  potionSlots: [],
  isLoading: true,
  refreshProfile: async () => {},
  setPotionSlotsOptimistic: () => {},
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

    // 1. Sync from cloud if possible (Push pending offline scores, then pull latest profile/inventory)
    await syncDataWithSupabase(userId);

    // 2. Read exact mirror from Local DB
    const localProfile = getLocalProfile(userId);

    // Safety net: in case user exists in Auth but hasn't synced profile yet
    if (!localProfile) {
      const meta = session.user.user_metadata;
      const displayName = meta?.full_name ?? meta?.name ?? session.user.email?.split('@')[0] ?? null;
      // We still try to create it in Supabase for first time users
      await supabase.from('profiles').insert({
        id: userId,
        username: null,
        display_name: displayName,
        avatar_url: meta?.avatar_url ?? null,
      });
      await supabase.from('inventory').insert({ user_id: userId });
      // Re-pull to local DB
      await syncDataWithSupabase(userId);
    }

    const finalProfile = getLocalProfile(userId);
    if (finalProfile) {
      setProfile({
        id: finalProfile.id,
        username: finalProfile.username,
        displayName: finalProfile.display_name,
        bits: finalProfile.bits ?? 0,
        avatarUrl: finalProfile.avatar_url,
        countryCode: finalProfile.country_code ?? null,
        allowFriendRequests: false,
      });
    }

    // Best scores from local DB (includes both local games and synced remote scores)
    const localBest = getLocalBestScores(userId);
    setBestScores(localBest);

    // Fetch Inventory strictly from local mirror
    const localInventory = getLocalInventory(userId);
    if (localInventory) {
      setInventory(localInventory as unknown as Inventory);
    } else {
      setInventory(null);
    }

    // Fetch Potion Slots strictly from local mirror
    const localSlots = getLocalPotionSlots(userId);
    if (localSlots.length > 0) {
      setPotionSlots(localSlots as unknown as UserPotionSlot[]);
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
      // could submit, a stale session will be in SQLite. Move it to the
      // pending queue so it gets submitted on this startup.
      const staleSession = getGameSessionData();
      if (staleSession) {
        // Dedup: check if a similar score already exists within a 1-minute window
        const isDuplicate = scoreExistsNear(
          session.user.id,
          staleSession.mode,
          staleSession.score,
          new Date().toISOString(),
        );
        if (!isDuplicate) {
          await queuePendingScore({
            mode: staleSession.mode,
            events: staleSession.events,
            roundReached: staleSession.challengeIndex,
            score: staleSession.score,
            sessionId: staleSession.sessionId ?? null,
          });
        }
        clearGameSessionData();
      }

      // Sync data handles pushing any scores queued while offline + pulling latest state
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
        setPotionSlotsOptimistic: setPotionSlots,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}
