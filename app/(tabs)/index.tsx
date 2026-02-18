import { ModeCard } from '@/components/mode-card';
import { PlayerInfoRow } from '@/components/player-info-row';
import { Colors } from '@/constants/theme';
import { useSession } from '@/context/ctx';
import { useProfile } from '@/context/profile-ctx';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const { session } = useSession();
  const { profile, bestScores, refreshProfile } = useProfile();
  const router = useRouter();

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
    router.push('/game/classic');
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
          onRankingsPress={() => Alert.alert('Rankings', 'Coming soon!')}
          onPotionsPress={() => Alert.alert('Potions', 'Coming soon!')}
        />

        {/* Mode Cards */}
        <View style={styles.section}>
          <ModeCard
            title="Classic"
            description="The standard mental challenge."
            bestScore={bestScores.classic}
            onPlayPress={handlePlayClassic}
            iconName="calculate"
          />

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
});
