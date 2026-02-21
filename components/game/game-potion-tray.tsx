import { getAutoUseMode, POTION_DISPLAY } from '@/constants/potions';
import { Colors, Spacing } from '@/constants/theme';
import { useProfile } from '@/context/profile-ctx';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getStoreItems, StoreItem } from '@/lib/store-service';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface GamePotionTrayProps {
  onUsePotion: (potionColumn: string) => Promise<void>;
  disabled?: boolean;
  secondChanceActive?: boolean;
  potionUsedCounts?: Record<string, number>;
}

export function GamePotionTray({ onUsePotion, disabled, secondChanceActive, potionUsedCounts = {} }: GamePotionTrayProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const { potionSlots, inventory } = useProfile();
  
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [loadingSlot, setLoadingSlot] = useState<number | null>(null);

  useEffect(() => {
    getStoreItems().then(setStoreItems).catch(() => {});
  }, []);

  const handlePress = async (slotIndex: number, potionCol: string) => {
    if (disabled || loadingSlot !== null) return;
    try {
      setLoadingSlot(slotIndex);
      await onUsePotion(potionCol);
    } finally {
      setLoadingSlot(null);
    }
  };

  return (
    <View style={styles.potionTray}>
      {[1, 2, 3].map((index) => {
        const slot = potionSlots?.find((s) => s.slot_index === index);
        const item = slot?.potion_type ? storeItems.find((i) => i.sku === slot.potion_type) : null;
        const column = item?.metadata?.column as keyof typeof inventory | undefined;
        const count = column && inventory ? inventory[column] : 0;
        const meta = column ? POTION_DISPLAY[column] : null;

        const slotQty = slot?.quantity ?? 1;
        const usedCount = column ? (potionUsedCounts[column] ?? 0) : 0;
        const remainingUses = Math.max(0, slotQty - usedCount);

        if (!slot || !item || !column || count <= 0) {
          // Empty or unequipped or out of stock slot
          return (
            <View key={index} style={[styles.potionSlot, { backgroundColor: theme.surfaceDim }]} />
          );
        }

        const autoMode = getAutoUseMode(column, storeItems);
        const isAutoUse = autoMode === 'always' || (autoMode === 'toggleable' && slot.auto_use_enabled);
        // Check if this auto-use potion is currently active
        const isActive = column === 'potion_second_chance' && secondChanceActive;
        // Auto-use potion fully consumed — all copies used up
        const isAutoConsumed = isAutoUse && !isActive && remainingUses <= 0 && usedCount > 0;

        if (isAutoUse && isActive) {
          // Active passive potion — non-tappable indicator with highlight
          return (
            <View
              key={index}
              style={[
                styles.potionSlot,
                styles.equippedSlot,
                styles.activeSlot,
                { backgroundColor: theme.surfaceVariant, borderColor: theme.primary },
              ]}
            >
              <MaterialIcons name={meta?.icon ?? 'science'} size={24} color={theme.primary} />
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{remainingUses}</Text>
              </View>
            </View>
          );
        }

        if (isAutoConsumed) {
          // Auto-use potion already consumed — dimmed indicator
          return (
            <View
              key={index}
              style={[
                styles.potionSlot,
                styles.equippedSlot,
                { backgroundColor: theme.surfaceDim, borderColor: theme.surfaceDim, opacity: 0.4 },
              ]}
            >
              <MaterialIcons name={meta?.icon ?? 'science'} size={24} color={theme.onSurface} />
              <View style={[styles.badge, { backgroundColor: '#9CA3AF' }]}>
                <Text style={styles.badgeText}>0</Text>
              </View>
            </View>
          );
        }

        return (
          <TouchableOpacity
            key={index}
            style={[
              styles.potionSlot,
              styles.equippedSlot,
              { backgroundColor: theme.surfaceVariant, borderColor: theme.primary },
            ]}
            disabled={disabled || loadingSlot !== null || count <= 0 || remainingUses <= 0}
            activeOpacity={0.7}
            onPress={() => handlePress(index, column as string)}
          >
            {loadingSlot === index ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <>
                <MaterialIcons name={meta?.icon ?? 'science'} size={24} color={theme.primary} />
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{remainingUses}</Text>
                </View>
              </>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  potionTray: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: Spacing.screenPadding,
  },
  potionSlot: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  equippedSlot: {
    borderWidth: 1,
    position: 'relative',
  },
  activeSlot: {
    borderWidth: 2,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
