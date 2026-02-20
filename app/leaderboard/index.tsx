import { Colors } from '@/constants/theme';
import { useProfile } from '@/context/profile-ctx';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getFriends, type FriendProfile } from '@/lib/friends-service';
import {
  buildFriendsLeaderboard,
  fetchGlobalLeaderboard,
  fetchRegionalLeaderboard,
  type LeaderboardEntry,
  type LeaderboardMode,
  type LeaderboardResult,
  type LeaderboardScope,
} from '@/lib/leaderboard-service';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ---------------------------------------------------------------------------
// LeaderboardRow
// ---------------------------------------------------------------------------

interface RowProps {
  entry: LeaderboardEntry;
  isCurrentUser: boolean;
  theme: (typeof Colors)['light'];
}

function countryFlag(code: string): string {
  return [...code.toUpperCase()].map(
    (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65),
  ).join('');
}

const LeaderboardRow = React.memo(function LeaderboardRow({ entry, isCurrentUser, theme }: RowProps) {
  const isTopThree = entry.rank <= 3;
  const rankColor = isTopThree ? theme.primary : theme.onSurfaceVariant;
  const displayScore = entry.score === 0 ? '—' : new Intl.NumberFormat('en-US').format(entry.score);

  return (
    <View style={[styles.row, isCurrentUser && { backgroundColor: theme.surfaceVariant }]}>
      <Text style={[styles.rowRank, { color: rankColor }]}>{entry.rank}</Text>
      <Text style={[styles.rowUsername, { color: theme.onSurface }]} numberOfLines={1} ellipsizeMode="tail">
        {entry.username}
      </Text>
      {entry.countryCode ? (
        <Text style={styles.rowFlag}>{countryFlag(entry.countryCode)}</Text>
      ) : (
        <Text style={[styles.rowFlag, { color: theme.onSurfaceVariant }]}>—</Text>
      )}
      <Text style={[styles.rowScore, { color: theme.onSurface }]}>{displayScore}</Text>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function LeaderboardScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { profile, bestScores } = useProfile();

  // UI state — only what the render tree reads
  const [mode, setMode] = useState<LeaderboardMode>('classic');
  const [scope, setScope] = useState<LeaderboardScope>('global');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LeaderboardResult>({ entries: [], playerRank: null });

  // ---------------------------------------------------------------------------
  // Refs — read inside callbacks without creating dependency loops
  // ---------------------------------------------------------------------------
  const cache = useRef<Record<string, LeaderboardResult>>({});
  const modeRef = useRef<LeaderboardMode>('classic');
  const scopeRef = useRef<LeaderboardScope>('global');
  const countryCodeRef = useRef<string | null>(profile?.countryCode ?? null);
  const friendsRef = useRef<FriendProfile[]>([]);

  // Keep profile ref for stable access inside doLoad
  const profileRef = useRef(profile);
  const bestScoresRef = useRef(bestScores);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { bestScoresRef.current = bestScores; }, [bestScores]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function resolveCountryCode(): string | null {
    // Country code is detected on the splash screen (GPS / IP geolocation)
    // and persisted to the profile. We just read it here.
    return profileRef.current?.countryCode ?? countryCodeRef.current;
  }

  function cacheKey(s: LeaderboardScope, m: LeaderboardMode, cc: string | null): string {
    return s === 'regional' && cc ? `${s}:${m}:${cc}` : `${s}:${m}`;
  }

  // Pure data fetcher — never touches isLoading
  async function fetchForScope(
    s: LeaderboardScope,
    m: LeaderboardMode,
    friendList: FriendProfile[],
    cc: string | null,
  ): Promise<void> {
    const key = cacheKey(s, m, cc);

    if (cache.current[key]) {
      setResult(cache.current[key]);
      return;
    }

    if (s === 'friends') {
      const p = profileRef.current;
      if (!p) return;
      const r = buildFriendsLeaderboard(
        m, friendList, p.id, p.username,
        bestScoresRef.current[m], p.countryCode ?? undefined,
      );
      cache.current[key] = r;
      setResult(r);
      return;
    }

    try {
      let r: LeaderboardResult;
      if (s === 'global') {
        r = await fetchGlobalLeaderboard(m);
      } else {
        if (!cc) {
          setResult({ entries: [], playerRank: null });
          return;
        }
        r = await fetchRegionalLeaderboard(m, cc);
      }
      cache.current[key] = r;
      setResult(r);
    } catch {
      setError('Could not load leaderboard. Pull down to refresh.');
    }
  }

  // ---------------------------------------------------------------------------
  // doLoad — reads everything from refs, no state deps → stable reference
  // ---------------------------------------------------------------------------
  const doLoad = useCallback(async (clearCache = false) => {
    if (clearCache) cache.current = {};
    setIsLoading(true);
    setError(null);

    // Refresh friends list (always, so friends leaderboard stays current)
    try {
      const fetched = await getFriends();
      friendsRef.current = fetched.map((f) => f.friend);
    } catch {
      // non-fatal — use stale friendsRef
    }

    const s = scopeRef.current;
    const m = modeRef.current;
    const cc = s === 'regional' ? resolveCountryCode() : countryCodeRef.current;
    await fetchForScope(s, m, friendsRef.current, cc);
    setIsLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable ref so useFocusEffect never sees a changing callback
  const doLoadRef = useRef(doLoad);
  useEffect(() => { doLoadRef.current = doLoad; });

  // Only re-runs on actual screen focus changes (not on dep changes)
  useFocusEffect(
    useCallback(() => {
      doLoadRef.current();
    }, []),
  );

  // ---------------------------------------------------------------------------
  // Tab handlers — update both state (UI) and ref (next call) synchronously
  // ---------------------------------------------------------------------------

  const handleModeChange = async (m: LeaderboardMode) => {
    setMode(m);
    modeRef.current = m;
    const cc = scopeRef.current === 'regional' ? resolveCountryCode() : countryCodeRef.current;
    const key = cacheKey(scopeRef.current, m, cc);
    if (!cache.current[key]) {
      setIsLoading(true);
      setError(null);
    }
    await fetchForScope(scopeRef.current, m, friendsRef.current, cc);
    setIsLoading(false);
  };

  const handleScopeChange = async (s: LeaderboardScope) => {
    setScope(s);
    scopeRef.current = s;
    const cc = s === 'regional' ? resolveCountryCode() : countryCodeRef.current;
    const key = cacheKey(s, modeRef.current, cc);
    if (!cache.current[key]) {
      setIsLoading(true);
      setError(null);
    }
    await fetchForScope(s, modeRef.current, friendsRef.current, cc);
    setIsLoading(false);
  };

  const handleRefresh = useCallback(() => doLoadRef.current(true), []);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const emptyMessage = (): string => {
    if (error) return error;
    if (scope === 'friends') return 'Add friends to see how you compare!';
    if (scope === 'regional' && !countryCodeRef.current) return 'Your region could not be detected.';
    return 'No scores yet. Be the first to play!';
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={[styles.emptyText, { color: theme.onSurfaceVariant }]}>{emptyMessage()}</Text>
    </View>
  );

  const playerRankScore = bestScores[mode];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={theme.onSurface} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.onSurface }]}>LEADERBOARD</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Mode tabs */}
      <View style={[styles.modeTabs, { backgroundColor: theme.surfaceVariant }]}>
        {(['classic', 'blitz'] as LeaderboardMode[]).map((m) => {
          const active = mode === m;
          return (
            <TouchableOpacity
              key={m}
              style={[styles.modeTab, active && { backgroundColor: theme.primary }]}
              onPress={() => handleModeChange(m)}
              activeOpacity={0.8}
            >
              <Text style={[styles.modeTabText, { color: active ? theme.onPrimary : theme.onSurfaceVariant }]}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Scope toggle */}
      <View style={styles.scopeRow}>
        {(['global', 'regional', 'friends'] as LeaderboardScope[]).map((s) => {
          const active = scope === s;
          return (
            <TouchableOpacity key={s} onPress={() => handleScopeChange(s)} style={styles.scopeTab}>
              <Text style={[styles.scopeTabText, { color: active ? theme.primary : theme.onSurfaceVariant }]}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
              {active && <View style={[styles.scopeUnderline, { backgroundColor: theme.primary }]} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content — spinner or fully loaded data */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      ) : (
        <>
          {/* Rank card — only visible after data is ready */}
          {result.playerRank !== null && (
            <View style={[styles.rankCard, { backgroundColor: theme.surfaceVariant }]}>
              <View style={styles.rankCardSide}>
                <Text style={[styles.rankCardLabel, { color: theme.onSurfaceVariant }]}>YOUR RANK</Text>
                <Text style={[styles.rankCardValue, { color: theme.primary }]}>#{result.playerRank}</Text>
              </View>
              <View style={styles.rankCardDivider} />
              <View style={styles.rankCardSide}>
                <Text style={[styles.rankCardLabel, { color: theme.onSurfaceVariant }]}>BEST</Text>
                <Text style={[styles.rankCardValue, { color: theme.onSurface }]}>
                  {playerRankScore === 0 ? '—' : new Intl.NumberFormat('en-US').format(playerRankScore)}
                </Text>
              </View>
            </View>
          )}

          <FlatList
            data={result.entries}
            keyExtractor={(item) => item.userId}
            renderItem={({ item }) => (
              <LeaderboardRow entry={item} isCurrentUser={item.userId === profile?.id} theme={theme} />
            )}
            getItemLayout={(_d, i) => ({ length: 56, offset: 56 * i, index: i })}
            ListEmptyComponent={renderEmpty}
            onRefresh={handleRefresh}
            refreshing={false}
            contentContainerStyle={result.entries.length === 0 && styles.emptyList}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 40, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', letterSpacing: 2 },
  modeTabs: {
    flexDirection: 'row',
    marginHorizontal: 24,
    marginTop: 4,
    borderRadius: 12,
    padding: 4,
  },
  modeTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  modeTabText: { fontSize: 14, fontWeight: '600' },
  scopeRow: { flexDirection: 'row', marginHorizontal: 24, marginTop: 16, marginBottom: 8 },
  scopeTab: { flex: 1, alignItems: 'center', paddingBottom: 8 },
  scopeTabText: { fontSize: 14, fontWeight: '500' },
  scopeUnderline: { height: 2, width: '60%', borderRadius: 1, marginTop: 4 },
  rankCard: {
    flexDirection: 'row',
    marginHorizontal: 24,
    marginBottom: 12,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  rankCardSide: { flex: 1, alignItems: 'center' },
  rankCardDivider: { width: 1, backgroundColor: 'rgba(128,128,128,0.2)', marginHorizontal: 8 },
  rankCardLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  rankCardValue: { fontSize: 22, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 24 },
  rowRank: { width: 36, fontSize: 15, fontWeight: '700' },
  rowUsername: { flex: 1, fontSize: 14, fontWeight: '500' },
  rowFlag: { fontSize: 18, marginHorizontal: 10 },
  rowScore: { fontSize: 14, fontWeight: '600' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { paddingHorizontal: 32, paddingTop: 48, alignItems: 'center' },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  emptyList: { flex: 1 },
});
