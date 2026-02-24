import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface PlayerInfoRowProps {
  username: string;
  bits: number;
  avatarUrl?: string;
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  onProfilePress?: () => void;
}

export function PlayerInfoRow({
  username,
  bits,
  avatarUrl,
  isOnline,
  isSyncing,
  lastSyncedAt,
  onProfilePress,
}: PlayerInfoRowProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  
  return (
    <View style={styles.container}>
      {/* Avatar — tappable, navigates to profile */}
      <TouchableOpacity
        onPress={onProfilePress}
        activeOpacity={0.8}
        style={[styles.avatarOuter, { borderColor: '#FFFFFF', shadowColor: '#000' }]}
      >
        <View style={styles.avatarInner}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: theme.primary }]}>
              <Text style={styles.avatarText}>{username.charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      <View style={styles.rightSection}>
        {/* Sync Status Icon */}
        <TouchableOpacity
          style={[styles.syncBadge, { backgroundColor: theme.surfaceVariant }]}
          activeOpacity={0.7}
          onPress={() => {
            if (lastSyncedAt) {
               alert(`Last synced: ${lastSyncedAt.toLocaleTimeString()}`);
            } else {
               alert(isOnline ? 'Online and syncing...' : 'Offline mode');
            }
          }}
        >
          {isOnline && !isSyncing ? (
            <MaterialIcons name="cloud" size={20} color={theme.primary} />
          ) : (
             <MaterialIcons name="cloud-off" size={20} color={theme.onSurfaceVariant} />
          )}
        </TouchableOpacity>

        <View style={[styles.bitsBadge, { backgroundColor: theme.surfaceVariant, borderColor: `${theme.primary}0D` }]}>
          <MaterialIcons name="paid" size={16} color="#D4A017" />
          <Text style={[styles.bitsText, { color: theme.primary }]}>{bits.toLocaleString()}</Text>
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    marginBottom: 8,
  },
  avatarOuter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 22,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bitsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    gap: 8,
  },
  syncBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bitsText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
