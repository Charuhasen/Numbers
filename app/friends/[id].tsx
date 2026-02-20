import { Colors } from '@/constants/theme';
import { getFriends, removeFriendship } from '@/lib/friends-service';
import type { FriendProfile, Friendship } from '@/lib/friends-service';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function FriendProfileScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [friendship, setFriendship] = useState<Friendship | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const friends = await getFriends();
        if (!cancelled) {
          const match = friends.find((f) => f.friend.id === id) ?? null;
          setFriendship(match);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const handleRemove = async () => {
    if (!friendship) return;
    Alert.alert(
      'Remove Friend',
      `Remove @${friendship.friend.username} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setIsRemoving(true);
            try {
              await removeFriendship(friendship.id);
              router.back();
            } catch {
              Alert.alert('Error', 'Could not remove friend. Please try again.');
              setIsRemoving(false);
            }
          },
        },
      ]
    );
  };

  const friend: FriendProfile | undefined = friendship?.friend;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={theme.onSurface} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.onSurface }]}>Profile</Text>
        <View style={styles.backBtn} />
      </View>

      {isLoading ? (
        <ActivityIndicator style={styles.loader} color={theme.onSurfaceVariant} />
      ) : !friend ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: theme.onSurfaceVariant }]}>
            Friend not found
          </Text>
        </View>
      ) : (
        <View style={styles.content}>
          {/* Avatar */}
          <View style={[styles.avatarLarge, { backgroundColor: theme.surfaceVariant }]}>
            <Text style={[styles.avatarLargeText, { color: theme.onSurfaceVariant }]}>
              {(friend.username[0] ?? '?').toUpperCase()}
            </Text>
          </View>

          {/* Username */}
          <Text style={[styles.username, { color: theme.onSurface }]}>
            @{friend.username}
          </Text>

          {/* Score chips */}
          <View style={styles.chips}>
            <View style={[styles.chip, { backgroundColor: theme.surfaceVariant }]}>
              <Text style={[styles.chipLabel, { color: theme.onSurfaceVariant }]}>Classic</Text>
              <Text style={[styles.chipScore, { color: theme.onSurface }]}>
                {friend.classicBest ?? 0}
              </Text>
            </View>
            <View style={[styles.chip, { backgroundColor: theme.surfaceVariant }]}>
              <Text style={[styles.chipLabel, { color: theme.onSurfaceVariant }]}>Blitz</Text>
              <Text style={[styles.chipScore, { color: theme.onSurface }]}>
                {friend.blitzBest ? friend.blitzBest : '—'}
              </Text>
            </View>
          </View>

          <View style={styles.spacer} />

          {/* Remove button */}
          <TouchableOpacity
            style={[styles.removeBtn, { borderColor: theme.error }]}
            onPress={handleRemove}
            disabled={isRemoving}
            activeOpacity={0.75}
          >
            {isRemoving ? (
              <ActivityIndicator size="small" color={theme.error} />
            ) : (
              <Text style={[styles.removeBtnText, { color: theme.error }]}>Remove Friend</Text>
            )}
          </TouchableOpacity>
        </View>
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
  backBtn: { width: 40 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  loader: { marginTop: 80 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15 },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 32,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarLargeText: {
    fontSize: 32,
    fontWeight: '700',
  },
  username: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 32,
  },
  chips: {
    flexDirection: 'row',
    gap: 12,
  },
  chip: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    minWidth: 100,
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  chipScore: {
    fontSize: 22,
    fontWeight: '700',
  },
  spacer: { flex: 1 },
  removeBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
