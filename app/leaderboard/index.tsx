import { Colors } from '@/constants/theme';
import { useProfile } from '@/context/profile-ctx';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getFriends, type FriendProfile } from '@/lib/friends-service';
import {
  buildFriendsLeaderboard,
  fetchGlobalLeaderboard,
  fetchRegionalLeaderboard,
  getLeaderboardFetchedAt,
  isLeaderboardFresh,
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
  Animated,
  RefreshControl,
  ScrollView,
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

function formatAge(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  return `${mins} mins ago`;
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
  // Start without a spinner if we already have fresh cached data for the default view
  const [isLoading, setIsLoading] = useState(() => !isLeaderboardFresh('classic', null));
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LeaderboardResult>({ entries: [], playerRank: null });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(
    () => getLeaderboardFetchedAt('classic', null),
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    toastOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2800),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToastMsg(null));
  }, [toastOpacity]);

  // ---------------------------------------------------------------------------
  // Refs — read inside callbacks without creating dependency loops
  // ---------------------------------------------------------------------------
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

  // Pure data fetcher — never touches isLoading; service handles TTL cache
  async function fetchForScope(
    s: LeaderboardScope,
    m: LeaderboardMode,
    friendList: FriendProfile[],
    cc: string | null,
  ): Promise<void> {
    if (s === 'friends') {
      const p = profileRef.current;
      if (!p) return;
      const r = buildFriendsLeaderboard(
        m, friendList, p.id, p.username,
        bestScoresRef.current[m], p.countryCode ?? undefined,
      );
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
      setResult(r);
    } catch {
      setError('Could not load leaderboard. Pull down to refresh.');
    }
  }

  // ---------------------------------------------------------------------------
  // doLoad — reads everything from refs, no state deps → stable reference
  // ---------------------------------------------------------------------------
  const doLoad = useCallback(async (viaRefresh = false) => {
    setError(null);

    const s = scopeRef.current;
    const m = modeRef.current;
    const cc = s === 'regional' ? resolveCountryCode() : null;

    // Show full-screen spinner only on initial/stale loads, not pull-to-refresh
    const needsNetwork = s !== 'friends' && !isLeaderboardFresh(m, cc);
    if (!viaRefresh && needsNetwork) setIsLoading(true);

    // Refresh friends list (needed for friends tab; also updates background data)
    try {
      const fetched = await getFriends();
      friendsRef.current = fetched.map((f) => f.friend);
    } catch {
      // non-fatal — use stale friendsRef
    }

    await fetchForScope(s, m, friendsRef.current, cc);
    setLastUpdated(s === 'friends' ? new Date() : getLeaderboardFetchedAt(m, cc));
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
    const s = scopeRef.current;
    const cc = s === 'regional' ? resolveCountryCode() : null;
    if (s !== 'friends' && !isLeaderboardFresh(m, cc)) {
      setIsLoading(true);
      setError(null);
    }
    await fetchForScope(s, m, friendsRef.current, cc);
    setLastUpdated(s === 'friends' ? new Date() : getLeaderboardFetchedAt(m, cc));
    setIsLoading(false);
  };

  const handleScopeChange = async (s: LeaderboardScope) => {
    setScope(s);
    scopeRef.current = s;
    const m = modeRef.current;
    const cc = s === 'regional' ? resolveCountryCode() : null;
    if (s !== 'friends' && !isLeaderboardFresh(m, cc)) {
      setIsLoading(true);
      setError(null);
    }
    await fetchForScope(s, m, friendsRef.current, cc);
    setLastUpdated(s === 'friends' ? new Date() : getLeaderboardFetchedAt(m, cc));
    setIsLoading(false);
  };

  const handleRefresh = useCallback(() => {
    const s = scopeRef.current;
    const m = modeRef.current;
    const cc = s === 'regional' ? resolveCountryCode() : null;

    // Friends tab is always re-fetchable (client-side, no RPC cost)
    if (s !== 'friends' && isLeaderboardFresh(m, cc)) {
      const fetchedAt = getLeaderboardFetchedAt(m, cc);
      if (fetchedAt) {
        const msLeft = 5 * 60 * 1000 - (Date.now() - fetchedAt.getTime());
        const minsLeft = Math.max(1, Math.ceil(msLeft / 60000));
        showToast(`You can refresh once every 5 mins. You can refresh again in ${minsLeft} minute${minsLeft === 1 ? '' : 's'}.`);
      }
      return;
    }

    setIsRefreshing(true);
    doLoadRef.current(true).finally(() => setIsRefreshing(false));
  }, [showToast]); // eslint-disable-line react-hooks/exhaustive-deps

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

      {/* Scrollable content — pull from anywhere triggers refresh */}
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Last updated timestamp */}
        {lastUpdated && !isLoading && (
          <Text style={[styles.lastUpdated, { color: theme.onSurfaceVariant }]}>
            Updated {formatAge(lastUpdated)}
          </Text>
        )}

        {isLoading ? (
          <ActivityIndicator color={theme.primary} size="large" style={styles.loadingSpinner} />
        ) : (
          <>
            {/* Rank card */}
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

            {/* Rows */}
            {result.entries.length === 0
              ? renderEmpty()
              : result.entries.map((item) => (
                  <LeaderboardRow
                    key={item.userId}
                    entry={item}
                    isCurrentUser={item.userId === profile?.id}
                    theme={theme}
                  />
                ))
            }
          </>
        )}
      </ScrollView>

      {/* Toast */}
      {toastMsg !== null && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>{toastMsg}</Text>
        </Animated.View>
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
  lastUpdated: {
    fontSize: 11,
    fontWeight: '400',
    textAlign: 'center',
    marginBottom: 8,
  },
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
  scrollContent: { flexGrow: 1 },
  loadingSpinner: { marginTop: 60 },
  row: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 24 },
  rowRank: { width: 36, fontSize: 15, fontWeight: '700' },
  rowUsername: { flex: 1, fontSize: 14, fontWeight: '500' },
  rowFlag: { fontSize: 18, marginHorizontal: 10 },
  rowScore: { fontSize: 14, fontWeight: '600' },
  emptyContainer: { paddingHorizontal: 32, paddingTop: 48, alignItems: 'center' },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  toast: {
    position: 'absolute',
    bottom: 32,
    left: 24,
    right: 24,
    backgroundColor: 'rgba(20,20,20,0.88)',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 18,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 18,
  },
});
