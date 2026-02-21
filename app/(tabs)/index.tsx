import { MODE_CARD_WIDTH, ModeCard } from '@/components/mode-card';
import { PlayerInfoRow } from '@/components/player-info-row';
import { Colors } from '@/constants/theme';
import { useProfile } from '@/context/profile-ctx';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const { profile, bestScores, refreshProfile } = useProfile();
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      refreshProfile();
    }, [refreshProfile])
  );

  const username = profile?.username ?? 'Player';

  const handlePlayClassic = () => {
    router.push('/game/classic');
  };
  const handleProfilePress = () => {
    router.push('/profile');
  };
  const handleSettingsPress = () => {
    router.push('/settings');
  };

  // Icon colors: dark-mode aware
  const indigoIconBg = isDark ? 'rgba(99,102,241,0.2)' : '#EEF2FF';
  const roseIconBg = isDark ? 'rgba(244,63,94,0.2)' : '#FFF1F2';
  const emeraldIconBg = isDark ? 'rgba(16,185,129,0.2)' : '#D1FAE5';
  const blueIconBg = isDark ? 'rgba(59,130,246,0.2)' : '#DBEAFE';
  const orangeIconBg = isDark ? 'rgba(249,115,22,0.2)' : '#FFEDD5';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <PlayerInfoRow
          username={username}
          bits={profile?.bits ?? 0}
          avatarUrl={profile?.avatarUrl ?? undefined}
          onProfilePress={handleProfilePress}
          onSettingsPress={handleSettingsPress}
        />

        {/* Quick Actions - 2 column grid */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.quickActionCard, { backgroundColor: theme.surfaceVariant }]}
            activeOpacity={0.75}
            onPress={() => Alert.alert('Potion Store', 'Coming soon!')}
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
            description="60-second sprint. No hearts. Pure speed."
            iconName="bolt"
            iconColor="#F97316"
            iconBgColor={orangeIconBg}
            comingSoon
          />
        </ScrollView>

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
