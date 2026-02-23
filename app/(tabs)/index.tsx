import { MODE_CARD_WIDTH, ModeCard } from '@/components/mode-card';
import { PlayerInfoRow } from '@/components/player-info-row';
import { PotionInventory } from '@/components/potion-inventory';
import { Colors } from '@/constants/theme';
import { useProfile } from '@/context/profile-ctx';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getLastSyncedAt } from '@/lib/sync-service';
import { MaterialIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const { profile, bestScores, refreshProfile } = useProfile();
  const router = useRouter();
  
  const [isOnline, setIsOnline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  useEffect(() => {
    const fetchSyncState = async () => {
       const netInfo = await NetInfo.fetch();
       setIsOnline(!!netInfo.isConnected);
       setLastSyncedAt(getLastSyncedAt());
    };
    fetchSyncState();
    
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(!!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setIsSyncing(true);
      refreshProfile().finally(() => {
        setIsSyncing(false);
        setLastSyncedAt(getLastSyncedAt());
      });
    }, [refreshProfile])
  );

  const username = profile?.username ?? 'Player';

  const handlePlayBlitz = () => {
    router.replace('/game/blitz');
  };

  const handlePlayClassic = () => {
    // replace instead of push — home must not sit under the game in the stack,
    // otherwise game-over's router.replace('/') would create a duplicate home entry.
    // gestureEnabled:false on the game route already prevents accidental swipe-back.
    router.replace('/game/classic');
  };
  const handleProfilePress = () => {
    router.push('/profile');
  };
  const handleSettingsPress = () => {
    router.push('/settings');
  };

  // Icon colors: dark-mode aware
  const indigoIconBg = colorScheme === 'dark' ? 'rgba(99,102,241,0.2)' : '#EEF2FF';
  const roseIconBg = colorScheme === 'dark' ? 'rgba(244,63,94,0.2)' : '#FFF1F2';
  const emeraldIconBg = colorScheme === 'dark' ? 'rgba(16,185,129,0.2)' : '#D1FAE5';
  const blueIconBg = colorScheme === 'dark' ? 'rgba(59,130,246,0.2)' : '#DBEAFE';
  const orangeIconBg = colorScheme === 'dark' ? 'rgba(249,115,22,0.2)' : '#FFEDD5';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      {/* Static Header */}
      <PlayerInfoRow
        username={username}
        bits={profile?.bits ?? 0}
        avatarUrl={profile?.avatarUrl ?? undefined}
        isOnline={isOnline}
        isSyncing={isSyncing}
        lastSyncedAt={lastSyncedAt}
        onProfilePress={handleProfilePress}
        onSettingsPress={handleSettingsPress}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never">

        {/* Quick Actions - 2 column grid */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.quickActionCard, { backgroundColor: theme.surfaceVariant }]}
            activeOpacity={0.75}
            onPress={() => router.push('/store')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: indigoIconBg }]}>
              <MaterialIcons name="science" size={22} color="#6366F1" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickActionCard, { backgroundColor: theme.surfaceVariant }]}
            activeOpacity={0.75}
            onPress={() => router.push('/leaderboard')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: roseIconBg }]}>
              <MaterialIcons name="emoji-events" size={22} color="#F43F5E" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickActionCard, { backgroundColor: theme.surfaceVariant }]}
            activeOpacity={0.75}
            onPress={() => router.push('/friends')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: emeraldIconBg }]}>
              <MaterialIcons name="people" size={22} color="#10B981" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Section header */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.onSurface }]}>Game Modes</Text>
        </View>

        {/* Horizontal carousel */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={MODE_CARD_WIDTH + 16}
          decelerationRate="fast"
          contentContainerStyle={styles.carouselContent}
        >
          <ModeCard
            title="Classic"
            description="Endless grids, 3 hearts, progressive difficulty."
            bestScore={bestScores.classic}
            onPlayPress={handlePlayClassic}
            iconName="calculate"
            iconColor="#3B82F6"
            iconBgColor={blueIconBg}
          />
          <ModeCard
            title="Blitz"
            description="1 heart. No second chances. How far can you go?"
            bestScore={bestScores.blitz}
            onPlayPress={handlePlayBlitz}
            iconName="bolt"
            iconColor="#F97316"
            iconBgColor={orangeIconBg}
          />
        </ScrollView>

        {/* Potion Inventory */}
        <PotionInventory />

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 12,
    paddingBottom: 32,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 14,
    paddingHorizontal: 24,
    marginBottom: 28,
  },
  quickActionCard: {
    padding: 12,
    borderRadius: 20,
  },
  quickActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeader: {
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  carouselContent: {
    paddingHorizontal: 24,
    gap: 16,
  },
});
