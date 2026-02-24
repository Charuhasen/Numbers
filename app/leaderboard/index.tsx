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
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { SafeAreaView } from 'react-native-safe-area-context';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCOPES: LeaderboardScope[] = ['global', 'regional', 'friends'];

// ---------------------------------------------------------------------------
// Per-page state type
// ---------------------------------------------------------------------------

interface PageState {
  result: LeaderboardResult;
  isLoading: boolean;
  lastUpdated: Date | null;
  error: string | null;
}

function initPageState(s: LeaderboardScope): PageState {
  if (s === 'global') {
    return {
      result: { entries: [], playerRank: null },
      isLoading: !isLeaderboardFresh('classic', null),
      lastUpdated: getLeaderboardFetchedAt('classic', null),
      error: null,
    };
  }
  // regional starts loading; friends is client-side so starts ready
  return {
    result: { entries: [], playerRank: null },
    isLoading: s === 'regional',
    lastUpdated: null,
    error: null,
  };
}

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

  const [mode, setMode] = useState<LeaderboardMode>('classic');
  const [activePage, setActivePage] = useState(0);
  const [pages, setPages] = useState<Record<LeaderboardScope, PageState>>(() => ({
    global: initPageState('global'),
    regional: initPageState('regional'),
    friends: initPageState('friends'),
  }));
  const [refreshingScope, setRefreshingScope] = useState<LeaderboardScope | null>(null);

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

  // PagerView ref for programmatic navigation (tab taps)
  const pagerRef = useRef<PagerView>(null);
  // Track active page in a ref to avoid redundant setState calls during scroll
  const activePageRef = useRef(0);
  const scopeScrollOffset = useRef(new Animated.Value(0)).current;
  const [scopeRowWidth, setScopeRowWidth] = useState(0);

  // ---------------------------------------------------------------------------
  // Refs — read inside stable callbacks without dependency loops
  // ---------------------------------------------------------------------------
  const modeRef = useRef<LeaderboardMode>('classic');
  const countryCodeRef = useRef<string | null>(profile?.countryCode ?? null);
  const friendsRef = useRef<FriendProfile[]>([]);
  const profileRef = useRef(profile);
  const bestScoresRef = useRef(bestScores);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { bestScoresRef.current = bestScores; }, [bestScores]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function resolveCountryCode(): string | null {
    return profileRef.current?.countryCode ?? countryCodeRef.current;
  }

  // Functional update — safe to call from stale closures (setPages is stable)
  function patchPage(s: LeaderboardScope, patch: Partial<PageState>) {
    setPages(prev => ({ ...prev, [s]: { ...prev[s], ...patch } }));
  }

  // ---------------------------------------------------------------------------
  // loadOneScope — fetches data for a single scope and updates its page state
  // ---------------------------------------------------------------------------
  const loadOneScope = useCallback(async (s: LeaderboardScope, m: LeaderboardMode) => {
    if (s === 'friends') {
      const p = profileRef.current;
      if (!p) return;
      const r = buildFriendsLeaderboard(
        m, friendsRef.current, p.id, p.username,
        bestScoresRef.current[m], p.countryCode ?? undefined,
      );
      patchPage(s, { result: r, isLoading: false, lastUpdated: new Date(), error: null });
      return;
    }

    const cc = s === 'regional' ? resolveCountryCode() : null;

    try {
      let r: LeaderboardResult;
      if (s === 'global') {
        r = await fetchGlobalLeaderboard(m);
      } else {
        if (!cc) {
          patchPage(s, { result: { entries: [], playerRank: null }, isLoading: false, error: null });
          return;
        }
        r = await fetchRegionalLeaderboard(m, cc);
      }
      const staleMsg = r.stale ? 'Showing cached data — pull to refresh when online.' : null;
      patchPage(s, { result: r, isLoading: false, lastUpdated: getLeaderboardFetchedAt(m, cc), error: staleMsg });
    } catch {
      patchPage(s, { isLoading: false, error: 'Leaderboards require an internet connection.' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // doLoad — refresh friends list then load all 3 scopes concurrently
  // ---------------------------------------------------------------------------
  const doLoad = useCallback(async () => {
    const m = modeRef.current;
    const cc = resolveCountryCode();

    // Only show the full-screen spinner for scopes with stale/empty data
    setPages(prev => ({
      global: { ...prev.global, isLoading: !isLeaderboardFresh(m, null) },
      regional: { ...prev.regional, isLoading: !isLeaderboardFresh(m, cc) },
      friends: { ...prev.friends, isLoading: false },
    }));

    try {
      const fetched = await getFriends();
      friendsRef.current = fetched.map(f => f.friend);
    } catch {
      // non-fatal
    }

    await Promise.all(SCOPES.map(s => loadOneScope(s, m)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doLoadRef = useRef(doLoad);
  useEffect(() => { doLoadRef.current = doLoad; });

  useFocusEffect(useCallback(() => {
    doLoadRef.current();
  }, []));

  // ---------------------------------------------------------------------------
  // Mode change — reload all pages for the new mode
  // ---------------------------------------------------------------------------
  const handleModeChange = async (m: LeaderboardMode) => {
    setMode(m);
    modeRef.current = m;
    const cc = resolveCountryCode();
    setPages(prev => ({
      global: { ...prev.global, isLoading: !isLeaderboardFresh(m, null) },
      regional: { ...prev.regional, isLoading: !isLeaderboardFresh(m, cc) },
      friends: { ...prev.friends },
    }));
    await Promise.all(SCOPES.map(s => loadOneScope(s, m)));
  };

  // ---------------------------------------------------------------------------
  // Pull-to-refresh — per scope, respects 5-min TTL
  // ---------------------------------------------------------------------------
  const handleRefresh = useCallback((s: LeaderboardScope) => {
    const m = modeRef.current;
    const cc = s === 'regional' ? resolveCountryCode() : null;

    if (s !== 'friends' && isLeaderboardFresh(m, cc)) {
      const fetchedAt = getLeaderboardFetchedAt(m, cc);
      if (fetchedAt) {
        const msLeft = 5 * 60 * 1000 - (Date.now() - fetchedAt.getTime());
        const minsLeft = Math.max(1, Math.ceil(msLeft / 60000));
        showToast(`You can refresh once every 5 mins. You can refresh again in ${minsLeft} minute${minsLeft === 1 ? '' : 's'}.`);
      }
      return;
    }

    setRefreshingScope(s);

    const doRefresh = async () => {
      // Re-fetch friends list when refreshing the friends tab
      if (s === 'friends') {
        try {
          const fetched = await getFriends();
          friendsRef.current = fetched.map(f => f.friend);
        } catch { /* non-fatal */ }
      }
      await loadOneScope(s, m);
    };

    doRefresh().finally(() => setRefreshingScope(null));
  }, [showToast, loadOneScope]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Render helper — empty / error message per scope
  // ---------------------------------------------------------------------------
  function emptyMessage(s: LeaderboardScope, error: string | null): string {
    if (error) return error;
    if (s === 'friends') return 'Add friends to see how you compare!';
    if (s === 'regional' && !countryCodeRef.current) return 'Your region could not be detected.';
    return 'No scores yet. Be the first to play!';
  }

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

      {/* Mode tabs — Classic / Blitz */}
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

      {/* Scope tabs — tap or swipe to navigate */}
      <View
        style={styles.scopeRow}
        onLayout={(e) => setScopeRowWidth(e.nativeEvent.layout.width)}
      >
        {SCOPES.map((s, i) => {
          const active = activePage === i;
          return (
            <TouchableOpacity
              key={s}
              style={styles.scopeTab}
              onPress={() => pagerRef.current?.setPage(i)}
            >
              <Text style={[styles.scopeTabText, { color: active ? theme.primary : theme.onSurfaceVariant }]}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
        {scopeRowWidth > 0 && (
          <Animated.View
            style={[
              styles.scopeUnderline,
              {
                width: scopeRowWidth / SCOPES.length,
                backgroundColor: theme.primary,
                transform: [{
                  translateX: scopeScrollOffset.interpolate({
                    inputRange: SCOPES.map((_, i) => i),
                    outputRange: SCOPES.map((_, i) => i * (scopeRowWidth / SCOPES.length)),
                    extrapolate: 'clamp',
                  }),
                }],
              },
            ]}
          />
        )}
      </View>

      {/* Swipeable pages — one per scope */}
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        overdrag={false}
        onPageScroll={(e) => {
          const { position, offset } = e.nativeEvent;
          scopeScrollOffset.setValue(position + offset);
        }}
        onPageSelected={(e) => {
          const p = e.nativeEvent.position;
          activePageRef.current = p;
          setActivePage(p);
        }}
      >
        {SCOPES.map((s) => {
          const { result, isLoading, lastUpdated, error } = pages[s];
          const playerRankScore = bestScores[mode];

          return (
            <FlatList
              key={s}
              data={result.entries}
              keyExtractor={(item) => item.userId}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshingScope === s}
                  onRefresh={() => handleRefresh(s)}
                  tintColor={theme.primary}
                  colors={[theme.primary]}
                />
              }
              ListHeaderComponent={
                <View>
                  {/* Last updated */}
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
                    </>
                  )}
                </View>
              }
              ListEmptyComponent={
                !isLoading ? (
                  <View style={styles.emptyContainer}>
                    <Text style={[styles.emptyText, { color: theme.onSurfaceVariant }]}>
                      {emptyMessage(s, error)}
                    </Text>
                  </View>
                ) : null
              }
              renderItem={({ item }) => (
                <LeaderboardRow
                  entry={item}
                  isCurrentUser={item.userId === profile?.id}
                  theme={theme}
                />
              )}
            />
          );
        })}
      </PagerView>

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
  scopeUnderline: { position: 'absolute', bottom: 0, left: 0, height: 2, borderRadius: 1 },
  pager: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  loadingSpinner: { marginTop: 60 },
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
