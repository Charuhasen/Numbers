import { POTION_DISPLAY } from '@/constants/potions';
import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ResolvedSlot } from '@/hooks/use-game-potions';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface GamePotionTrayProps {
  slots: ResolvedSlot[];
  onUsePotion: (potionColumn: string) => Promise<void>;
  disabled?: boolean;
  secondChanceActive?: boolean;
}

export function GamePotionTray({ slots, onUsePotion, disabled, secondChanceActive }: GamePotionTrayProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const [loadingSlot, setLoadingSlot] = React.useState<number | null>(null);

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
        const slot = slots.find((s) => s.slotIndex === index);

        if (!slot) {
          return (
            <View key={index} style={[styles.potionSlot, { backgroundColor: theme.surfaceDim }]} />
          );
        }

        const meta = POTION_DISPLAY[slot.potionColumn];
        const isAutoUse = slot.autoUseMode === 'always' ||
          (slot.autoUseMode === 'toggleable' && slot.autoUseEnabled);
        const isActive = slot.potionColumn === 'potion_second_chance' && secondChanceActive;
        if (isAutoUse && isActive) {
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
                <Text style={styles.badgeText}>{slot.remainingUses}</Text>
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
            disabled={disabled || loadingSlot !== null || slot.remainingUses <= 0}
            activeOpacity={0.7}
            onPress={() => handlePress(index, slot.potionColumn)}
          >
            {loadingSlot === index ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <>
                <MaterialIcons name={meta?.icon ?? 'science'} size={24} color={theme.primary} />
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{slot.remainingUses}</Text>
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
