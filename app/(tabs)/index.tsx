import { ModeCard } from '@/components/mode-card';
import { PlayerInfoRow } from '@/components/player-info-row';
import { Colors } from '@/constants/theme';
import { useSession } from '@/context/ctx';
import { useProfile } from '@/context/profile-ctx';
import { Difficulty } from '@/engine/types';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const { session } = useSession();
  const { profile, bestScores, refreshProfile } = useProfile();
  const router = useRouter();

  const [classicDifficulty, setClassicDifficulty] = useState<Difficulty>('easy');
  const [blitzDifficulty, setBlitzDifficulty] = useState<Difficulty>('easy');
  const [dailyDifficulty, setDailyDifficulty] = useState<Difficulty>('easy');

  // Refresh profile data whenever this screen comes into focus
  useFocusEffect(
    useCallback(() => {
      refreshProfile();
    }, [refreshProfile])
  );

  const fullName = session?.user?.user_metadata?.full_name
    || session?.user?.user_metadata?.name
    || session?.user?.email?.split('@')[0]
    || 'Player';
  const displayName = fullName.split(/\s+/)[0];

  const handlePlayClassic = () => {
    router.push(`/game/classic?difficulty=${classicDifficulty}`);
  };
  const handlePlayBlitz = () => {
    router.push(`/game/blitz?difficulty=${blitzDifficulty}`);
  };
  const handlePlayDaily = () => {
    router.push(`/game/daily?difficulty=${dailyDifficulty}`);
  };

  const handleSettingsPress = () => {
    Alert.alert('Settings', 'Profile & settings coming soon.');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <PlayerInfoRow
          username={displayName}
          bits={profile?.bits ?? 0}
          onSettingsPress={handleSettingsPress}
        />

        {/* Mode Cards */}
        <View style={styles.section}>
          <ModeCard
            title="Classic"
            description="The standard mental challenge."
            bestScore={bestScores.classic}
            onPlayPress={handlePlayClassic}
            iconName="calculate"
            difficulty={classicDifficulty}
            onDifficultyChange={setClassicDifficulty}
          />

          <ModeCard
            title="Blitz"
            description="Fast-paced arithmetic."
            bestScore={bestScores.blitz}
            onPlayPress={handlePlayBlitz}
            iconName="bolt"
            difficulty={blitzDifficulty}
            onDifficultyChange={setBlitzDifficulty}
          />

          <ModeCard
            title="Daily"
            description="New puzzles every 24h."
            bestScore={bestScores.daily}
            onPlayPress={handlePlayDaily}
            iconName="calendar-today"
            difficulty={dailyDifficulty}
            onDifficultyChange={setDailyDifficulty}
          />
        </View>

        {/* Quick Access Section */}
        <View style={styles.quickAccessSection}>
          <Text style={[styles.sectionTitle, { color: `${theme.primary}99` }]}>QUICK ACCESS</Text>
          <View style={styles.quickAccessGrid}>
            <TouchableOpacity
              style={[styles.quickActionButton, { backgroundColor: `${theme.surfaceVariant}B3` }]}
              activeOpacity={0.7}
            >
              <View style={[styles.iconCircle, { backgroundColor: `${theme.primary}1A` }]}>
                <MaterialIcons name="emoji-events" size={24} color={theme.primary} />
              </View>
              <Text style={[styles.quickActionText, { color: theme.onSurface }]}>Rankings</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickActionButton, { backgroundColor: `${theme.surfaceVariant}B3` }]}
              activeOpacity={0.7}
            >
              <View style={[styles.iconCircle, { backgroundColor: `${theme.primary}1A` }]}>
                <MaterialIcons name="science" size={24} color={theme.primary} />
              </View>
              <Text style={[styles.quickActionText, { color: theme.onSurface }]}>My Potions</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.footerSpacing}>
          <View style={[styles.footerDivider, { backgroundColor: `${theme.primary}33` }]} />
        </View>

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
  },
  section: {
    marginTop: 8,
  },
  quickAccessSection: {
    paddingHorizontal: 24,
    marginTop: 24,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.4,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  quickAccessGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  quickActionButton: {
    flex: 1,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  footerSpacing: {
    marginTop: 32,
    alignItems: 'center',
    paddingBottom: 40,
  },
  footerDivider: {
    width: 32,
    height: 4,
    borderRadius: 2,
  },
});
