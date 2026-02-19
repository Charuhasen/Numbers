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
}

export interface BestScores {
  classic: number;
}

const emptyBestScores = (): BestScores => ({
  classic: 0,
});

interface ProfileContextValue {
  profile: Profile | null;
  bestScores: BestScores;
  isLoading: boolean;
  refreshProfile: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue>({
  profile: null,
  bestScores: emptyBestScores(),
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
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!session?.user?.id) {
      setProfile(null);
      setBestScores(emptyBestScores());
      setIsLoading(false);
      return;
    }

    const userId = session.user.id;

    // Fetch profile
    let profileResult = await supabase
      .from('profiles')
      .select('id, username, display_name, bits, avatar_url')
      .eq('id', userId)
      .single();

    // Safety net: create profile if trigger didn't fire (e.g. pre-existing user)
    if (!profileResult.data) {
      const meta = session.user.user_metadata;
      const displayName = meta?.full_name ?? meta?.name ?? session.user.email?.split('@')[0] ?? null;
      await supabase.from('profiles').insert({
        id: userId,
        username: displayName,
        display_name: displayName,
        avatar_url: meta?.avatar_url ?? null,
      });
      // Also ensure inventory exists
      await supabase.from('inventory').insert({ user_id: userId });
      // Re-fetch after creation
      profileResult = await supabase
        .from('profiles')
        .select('id, username, display_name, bits, avatar_url')
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

    setIsLoading(false);
  }, [session?.user?.id]);

  // Fetch on mount / session change, and flush pending scores
  useEffect(() => {
    if (!session?.user?.id) {
      setProfile(null);
      setBestScores(emptyBestScores());
      setIsLoading(false);
      return;
    }

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
        isLoading,
        refreshProfile: fetchProfile,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}
