import {
  Friendship,
  SearchResult,
  getFriends,
  getIncomingRequests,
  getSentRequests,
  removeFriendship,
  respondToRequest,
  searchUsers,
  sendFriendRequest,
} from '@/lib/friends-service';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Tab = 'friends' | 'add' | 'requests';

export default function FriendsScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [friends, setFriends] = useState<Friendship[]>([]);
  const [incoming, setIncoming] = useState<Friendship[]>([]);
  const [sent, setSent] = useState<Friendship[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  const loadSocialData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [f, inc, s] = await Promise.all([
        getFriends(),
        getIncomingRequests(),
        getSentRequests(),
      ]);
      setFriends(f);
      setIncoming(inc);
      setSent(s);
    } catch {
      // silently fail — not critical
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSocialData();
    }, [loadSocialData])
  );

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchUsers(q);
      setSearchResults(results);
    } catch {
      Alert.alert('Error', 'Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSendRequest = async (userId: string) => {
    try {
      await sendFriendRequest(userId);
      setSearchResults((prev) =>
        prev.map((r) =>
          r.id === userId
            ? { ...r, relationshipStatus: 'pending', isSender: true }
            : r
        )
      );
    } catch {
      Alert.alert('Error', 'Could not send friend request.');
    }
  };

  const handleRespond = async (friendshipId: string, accept: boolean) => {
    try {
      await respondToRequest(friendshipId, accept);
      await loadSocialData();
    } catch {
      Alert.alert('Error', 'Could not update request.');
    }
  };

  const handleCancel = async (friendshipId: string) => {
    try {
      await removeFriendship(friendshipId);
      setSent((prev) => prev.filter((f) => f.id !== friendshipId));
      setSearchResults((prev) =>
        prev.map((r) =>
          r.friendshipId === friendshipId
            ? { ...r, relationshipStatus: undefined, friendshipId: undefined, isSender: undefined }
            : r
        )
      );
    } catch {
      Alert.alert('Error', 'Could not cancel request.');
    }
  };

  // ── Render helpers ──────────────────────────────────────────────────────────

  const renderFriend = ({ item }: { item: Friendship }) => (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: theme.outlineVariant }]}
      onPress={() => router.push(`/friends/${item.friend.id}`)}
      activeOpacity={0.75}
    >
      <View style={[styles.avatar, { backgroundColor: theme.surfaceVariant }]}>
        <Text style={[styles.avatarText, { color: theme.onSurfaceVariant }]}>
          {(item.friend.username[0] ?? '?').toUpperCase()}
        </Text>
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowName, { color: theme.onSurface }]} numberOfLines={1}>
          @{item.friend.username}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color={theme.onSurfaceVariant} />
    </TouchableOpacity>
  );

  const renderSearchResult = ({ item }: { item: SearchResult }) => {
    const canAdd = !item.relationshipStatus;
    const isPending = item.relationshipStatus === 'pending' && item.isSender;
    const isIncoming = item.relationshipStatus === 'pending' && !item.isSender;
    const isFriend = item.relationshipStatus === 'accepted';

    return (
      <View style={[styles.row, { borderBottomColor: theme.outlineVariant }]}>
        <View style={[styles.avatar, { backgroundColor: theme.surfaceVariant }]}>
          <Text style={[styles.avatarText, { color: theme.onSurfaceVariant }]}>
            {(item.username[0] ?? '?').toUpperCase()}
          </Text>
        </View>
        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, { color: theme.onSurface }]} numberOfLines={1}>
            @{item.username}
          </Text>
        </View>
        {canAdd && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
            onPress={() => handleSendRequest(item.id)}
            activeOpacity={0.8}
          >
            <Text style={styles.actionBtnText}>Add</Text>
          </TouchableOpacity>
        )}
        {isPending && (
          <View style={[styles.actionBtn, styles.actionBtnDisabled, { backgroundColor: theme.surfaceVariant }]}>
            <Text style={[styles.actionBtnText, { color: theme.onSurfaceVariant }]}>Pending</Text>
          </View>
        )}
        {isIncoming && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#3B82F6' }]}
            onPress={() =>
              Alert.alert(
                `Friend request from @${item.username}`,
                undefined,
                [
                  { text: 'Decline', style: 'destructive', onPress: () => handleRespond(item.friendshipId!, false) },
                  { text: 'Accept', onPress: () => handleRespond(item.friendshipId!, true) },
                ]
              )
            }
            activeOpacity={0.8}
          >
            <Text style={styles.actionBtnText}>Respond</Text>
          </TouchableOpacity>
        )}
        {isFriend && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.surfaceVariant }]}
            onPress={() => router.push(`/friends/${item.id}`)}
            activeOpacity={0.8}
          >
            <Text style={[styles.actionBtnText, { color: theme.onSurface }]}>Friends</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderIncoming = ({ item }: { item: Friendship }) => (
    <View style={[styles.row, { borderBottomColor: theme.outlineVariant }]}>
      <View style={[styles.avatar, { backgroundColor: theme.surfaceVariant }]}>
        <Text style={[styles.avatarText, { color: theme.onSurfaceVariant }]}>
          {(item.friend.username[0] ?? '?').toUpperCase()}
        </Text>
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowName, { color: theme.onSurface }]} numberOfLines={1}>
          @{item.friend.username}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: '#C4897A', marginRight: 6 }]}
        onPress={() => handleRespond(item.id, false)}
        activeOpacity={0.8}
      >
        <Text style={styles.actionBtnText}>Decline</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
        onPress={() => handleRespond(item.id, true)}
        activeOpacity={0.8}
      >
        <Text style={styles.actionBtnText}>Accept</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSent = ({ item }: { item: Friendship }) => (
    <View style={[styles.row, { borderBottomColor: theme.outlineVariant }]}>
      <View style={[styles.avatar, { backgroundColor: theme.surfaceVariant }]}>
        <Text style={[styles.avatarText, { color: theme.onSurfaceVariant }]}>
          {(item.friend.username[0] ?? '?').toUpperCase()}
        </Text>
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowName, { color: theme.onSurface }]} numberOfLines={1}>
          @{item.friend.username}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: theme.surfaceVariant }]}
        onPress={() => handleCancel(item.id)}
        activeOpacity={0.8}
      >
        <Text style={[styles.actionBtnText, { color: theme.onSurfaceVariant }]}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  const requestBadge = incoming.length;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'friends', label: 'Friends' },
    { key: 'add', label: 'Add' },
    { key: 'requests', label: 'Requests' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={theme.onSurface} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.onSurface }]}>Friends</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: theme.outlineVariant }]}>
        {tabs.map(({ key, label }) => (
          <Pressable
            key={key}
            style={styles.tabItem}
            onPress={() => setActiveTab(key)}
          >
            <Text style={[styles.tabLabel, { color: activeTab === key ? '#10B981' : theme.onSurfaceVariant }]}>
              {label}
            </Text>
            {key === 'requests' && requestBadge > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{requestBadge}</Text>
              </View>
            )}
            {activeTab === key && <View style={styles.tabUnderline} />}
          </Pressable>
        ))}
      </View>

      {/* Friends tab */}
      {activeTab === 'friends' && (
        <View style={styles.flex}>
          {isLoadingData ? (
            <ActivityIndicator style={styles.loader} color={theme.onSurfaceVariant} />
          ) : (
            <FlatList
              data={friends}
              keyExtractor={(item) => item.id}
              renderItem={renderFriend}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: theme.onSurfaceVariant }]}>
                  No friends yet — search for players in the Add tab
                </Text>
              }
            />
          )}
        </View>
      )}

      {/* Add tab */}
      {activeTab === 'add' && (
        <View style={styles.flex}>
          <View style={[styles.searchBar, { backgroundColor: theme.surfaceVariant }]}>
            <MaterialIcons name="person-add" size={20} color={theme.onSurfaceVariant} />
            <TextInput
              style={[styles.searchInput, { color: theme.onSurface }]}
              placeholder="Search by username…"
              placeholderTextColor={theme.onSurfaceVariant}
              value={searchQuery}
              onChangeText={handleSearch}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {isSearching && <ActivityIndicator size="small" color={theme.onSurfaceVariant} />}
            {searchQuery.length > 0 && !isSearching && (
              <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
                <MaterialIcons name="close" size={18} color={theme.onSurfaceVariant} />
              </TouchableOpacity>
            )}
          </View>
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            renderItem={renderSearchResult}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              searchQuery.length > 0 && !isSearching ? (
                <Text style={[styles.emptyText, { color: theme.onSurfaceVariant }]}>
                  No users found
                </Text>
              ) : null
            }
          />
        </View>
      )}

      {/* Requests tab */}
      {activeTab === 'requests' && (
        <View style={styles.flex}>
          {isLoadingData ? (
            <ActivityIndicator style={styles.loader} color={theme.onSurfaceVariant} />
          ) : incoming.length === 0 && sent.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.onSurfaceVariant }]}>
              No pending requests
            </Text>
          ) : (
            <SectionList
              sections={[
                { key: 'incoming', title: 'Incoming', data: incoming },
                { key: 'sent', title: 'Outgoing', data: sent },
              ]}
              keyExtractor={(item) => item.id}
              renderSectionHeader={({ section }) =>
                section.data.length > 0 ? (
                  <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant, backgroundColor: theme.surface }]}>
                    {section.title}
                  </Text>
                ) : null
              }
              renderItem={({ item, section }) =>
                section.key === 'incoming'
                  ? renderIncoming({ item })
                  : renderSent({ item })
              }
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 40 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#10B981',
    borderRadius: 1,
  },
  badge: {
    backgroundColor: '#F43F5E',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    margin: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  listContent: { paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowInfo: {
    flex: 1,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDisabled: {
    opacity: 0.7,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 48,
    fontSize: 15,
    paddingHorizontal: 32,
  },
  loader: {
    marginTop: 48,
  },
});
