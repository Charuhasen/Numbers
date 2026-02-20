import { Colors } from '@/constants/theme';
import { useSession } from '@/context/ctx';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { signOut } = useSession();

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => signOut(),
      },
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

      {/* List */}
      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.row, { backgroundColor: theme.surfaceVariant }]}
          onPress={handleSignOut}
          activeOpacity={0.75}
        >
          <MaterialIcons name="logout" size={20} color={theme.error} />
          <Text style={[styles.rowLabel, { color: theme.error }]}>Sign Out</Text>
        </TouchableOpacity>
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
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 16,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
});
