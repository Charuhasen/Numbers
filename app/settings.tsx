import { Colors } from '@/constants/theme';
import { useSession } from '@/context/ctx';
import { useProfile } from '@/context/profile-ctx';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { isHapticsEnabled, setHapticsEnabled } from '@/lib/haptics';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Convert an ISO 3166-1 alpha-2 code to its emoji flag (e.g. "US" → 🇺🇸). */
function countryFlag(code: string): string {
  return [...code.toUpperCase()].map(
    (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65),
  ).join('');
}

/** Return the English display name for an ISO country code (e.g. "US" → "United States"). */
function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { signOut } = useSession();
  const { profile } = useProfile();
  const regionCode = profile?.countryCode ?? null;

  const [hapticsOn, setHapticsOn] = useState(isHapticsEnabled);

  const handleHapticsToggle = (value: boolean) => {
    setHapticsOn(value);
    setHapticsEnabled(value);
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={theme.onSurface} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.onSurface }]}>Settings</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Preferences */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>Preferences</Text>
        <View style={[styles.card, { backgroundColor: theme.surfaceVariant }]}>
          <View style={styles.row}>
            <MaterialIcons name="vibration" size={20} color={theme.onSurface} />
            <Text style={[styles.rowLabel, { color: theme.onSurface }]}>Vibration</Text>
            <Switch
              value={hapticsOn}
              onValueChange={handleHapticsToggle}
              trackColor={{ false: theme.surfaceDim, true: '#10B981' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.divider, { backgroundColor: theme.surfaceDim }]} />

          {/* Read-only — region is detected automatically via GPS / IP */}
          <View style={styles.row}>
            <MaterialIcons name="public" size={20} color={theme.onSurface} />
            <Text style={[styles.rowLabel, { color: theme.onSurface }]}>Region</Text>
            {regionCode ? (
              <Text style={[styles.rowValue, { color: theme.onSurfaceVariant }]}>
                {countryFlag(regionCode)}{'  '}{countryName(regionCode)}
              </Text>
            ) : (
              <Text style={[styles.rowValue, { color: theme.onSurfaceVariant }]}>Not detected</Text>
            )}
          </View>
        </View>
      </View>

      {/* Account */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>Account</Text>
        <View style={[styles.card, { backgroundColor: theme.surfaceVariant }]}>
          <TouchableOpacity style={styles.row} onPress={handleSignOut} activeOpacity={0.75}>
            <MaterialIcons name="logout" size={20} color={theme.error} />
            <Text style={[styles.rowLabel, { color: theme.error }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>
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
  section: {
    marginTop: 24,
    paddingHorizontal: 24,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginLeft: 4,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '400',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
});
