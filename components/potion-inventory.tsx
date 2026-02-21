import { AUTO_USE_POTIONS } from '@/constants/potions';
import { Colors } from '@/constants/theme';
import { useProfile, type UserPotionSlot } from '@/context/profile-ctx';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getStoreItems, StoreItem } from '@/lib/store-service';
import { supabase } from '@/lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    View,
} from 'react-native';

const POTION_DISPLAY: Record<string, { icon: keyof typeof MaterialIcons.glyphMap; label: string }> = {
  potion_time_freeze:   { icon: 'timer',                label: 'Time Freeze'   },
  potion_second_chance: { icon: 'shield',               label: 'Second Chance' },
  potion_50_50:         { icon: 'content-cut',          label: '50/50'         },
  potion_scanner:       { icon: 'center-focus-strong',  label: 'Scanner'       },
  potion_fortune_tonic: { icon: 'auto-awesome',         label: 'Fortune Tonic' },
  potion_grid_skip:     { icon: 'skip-next',            label: 'Grid Skip'     },
  potion_revive:        { icon: 'autorenew',            label: 'Revive'        },
};

export function PotionInventory() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const { profile, inventory, potionSlots, setPotionSlotsOptimistic } = useProfile();

  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);

  // Modal state
  const [editingSlot, setEditingSlot] = useState<number | null>(null);

  useEffect(() => {
    getStoreItems()
      .then((items) => {
        setStoreItems(items);
        setLoadingItems(false);
      })
      .catch(() => {
        setLoadingItems(false);
      });
  }, []);

  // Filter potions user owns
  const ownedPotions = useMemo(() => {
    if (!inventory) return [];
    return storeItems.filter((item) => {
      if (item.type !== 'potion' || !item.metadata?.column) return false;
      const col = item.metadata.column as keyof typeof inventory;
      return inventory[col] > 0;
    });
  }, [storeItems, inventory]);

  if (!inventory || !profile) return null;

  const applySlotUpdate = (slotIndex: number, potionType: string | null, autoUse: boolean) => {
    // Optimistic: update potionSlots immediately
    let nextSlots: UserPotionSlot[];
    if (potionType === null) {
      nextSlots = potionSlots.filter((s) => s.slot_index !== slotIndex);
    } else {
      const existing = potionSlots.find((s) => s.slot_index === slotIndex);
      if (existing) {
        nextSlots = potionSlots.map((s) =>
          s.slot_index === slotIndex
            ? { ...s, potion_type: potionType, auto_use_enabled: autoUse }
            : s,
        );
      } else {
        nextSlots = [
          ...potionSlots,
          { slot_index: slotIndex, potion_type: potionType, auto_use_enabled: autoUse },
        ];
      }
    }
    setPotionSlotsOptimistic(nextSlots);
    return nextSlots;
  };

  const handleUpdateSlot = async (slotIndex: number, potionType: string | null, autoUse: boolean) => {
    if (!profile.id) return;

    // Apply optimistic update first
    const previousSlots = [...potionSlots];
    applySlotUpdate(slotIndex, potionType, autoUse);

    try {
      if (potionType === null) {
        const { error } = await supabase
          .from('user_potion_slots')
          .delete()
          .eq('user_id', profile.id)
          .eq('slot_index', slotIndex);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_potion_slots')
          .upsert({
            user_id: profile.id,
            slot_index: slotIndex,
            potion_type: potionType,
            auto_use_enabled: autoUse,
          });
        if (error) throw error;
      }
    } catch (err: any) {
      // Rollback on failure
      setPotionSlotsOptimistic(previousSlots);
      Alert.alert('Error', err.message);
    }
  };

  const renderSlot = (index: number) => {
    const slot = potionSlots.find((s) => s.slot_index === index);
    const item = slot?.potion_type ? storeItems.find((i) => i.sku === slot.potion_type) : null;

    let count = 0;
    if (item?.metadata?.column) {
      count = inventory[item.metadata.column as keyof typeof inventory] || 0;
    }

    const meta = item ? POTION_DISPLAY[item.metadata?.column ?? ''] : null;

    return (
      <View key={index} style={[styles.slotContainer, { backgroundColor: theme.surfaceVariant }]}>
        <View style={styles.slotHeader}>
          <Text style={[styles.slotTitle, { color: theme.onSurfaceVariant }]}>Slot {index}</Text>
          {slot && (
            <Pressable onPress={() => handleUpdateSlot(index, null, false)} hitSlop={12}>
              <MaterialIcons name="close" size={16} color={theme.onSurfaceVariant} />
            </Pressable>
          )}
        </View>

        <Pressable
          style={styles.slotMain}
          onPress={() => setEditingSlot(index)}
        >
          {item ? (
            <>
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
                ]}
              >
                <MaterialIcons name={meta?.icon ?? 'science'} size={24} color={theme.primary} />
              </View>
              <View style={styles.slotInfo}>
                <Text style={[styles.itemName, { color: theme.onSurface }]}>{item.name}</Text>
                <Text style={[styles.itemCount, { color: theme.onSurfaceVariant }]}>
                  {count} Owned
                </Text>
              </View>
            </>
          ) : (
            <>
              <View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: theme.outlineVariant,
                  },
                ]}
              >
                <MaterialIcons name="add" size={24} color={theme.onSurfaceVariant} />
              </View>
              <View style={styles.slotInfo}>
                <Text style={[styles.emptyText, { color: theme.onSurfaceVariant }]}>
                  Tap to equip
                </Text>
              </View>
            </>
          )}
        </Pressable>

        {slot && item?.metadata?.column && AUTO_USE_POTIONS.has(item.metadata.column) && (
          <View style={styles.autoUseRow}>
            <Text style={[styles.autoUseText, { color: theme.onSurface }]}>Auto-Use</Text>
            <Switch
              value={slot.auto_use_enabled}
              onValueChange={(val) => handleUpdateSlot(index, slot.potion_type, val)}
              trackColor={{ false: theme.surfaceDim, true: theme.primary }}
            />
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.onSurface }]}>Blitz Loadout</Text>
      </View>
      <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
        Equip up to 3 potions for your next Blitz match.
      </Text>

      {loadingItems ? (
        <ActivityIndicator color={theme.primary} />
      ) : (
        <View style={styles.slotsRow}>
          {[1, 2, 3].map(renderSlot)}
        </View>
      )}

      {/* Potion Picker Modal */}
      <Modal visible={editingSlot !== null} animationType="fade" transparent>
        <Pressable
          style={[
            styles.modalOverlay,
            { backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.5)' },
          ]}
          onPress={() => setEditingSlot(null)}
        >
          <Pressable
            style={[styles.modalContent, { backgroundColor: theme.surface }]}
            onPress={undefined}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.onSurface }]}>
                Equip Slot {editingSlot}
              </Text>
              <Pressable onPress={() => setEditingSlot(null)} hitSlop={12}>
                <MaterialIcons name="close" size={24} color={theme.onSurface} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {ownedPotions.length === 0 ? (
                <Text style={[styles.emptyModalText, { color: theme.onSurfaceVariant }]}>
                  You don't own any potions. Buy some from the store!
                </Text>
              ) : (
                ownedPotions.map((potion) => {
                  const meta = POTION_DISPLAY[potion.metadata?.column ?? ''];
                  const isEquipped = potionSlots.some(
                    (s) => s.potion_type === potion.sku && s.slot_index !== editingSlot,
                  );
                  const count =
                    inventory[(potion.metadata?.column) as keyof typeof inventory] || 0;

                  return (
                    <Pressable
                      key={potion.sku}
                      style={[
                        styles.pickerItem,
                        {
                          backgroundColor: theme.surfaceVariant,
                          opacity: isEquipped ? 0.5 : 1,
                        },
                      ]}
                      disabled={isEquipped}
                      onPress={() => {
                        // Close modal immediately for snappy feel
                        const slot = editingSlot;
                        setEditingSlot(null);
                        if (slot) {
                          handleUpdateSlot(slot, potion.sku, false);
                        }
                      }}
                    >
                      <View
                        style={[
                          styles.iconWrap,
                          {
                            backgroundColor: isDark
                              ? 'rgba(255,255,255,0.1)'
                              : 'rgba(0,0,0,0.05)',
                          },
                        ]}
                      >
                        <MaterialIcons name={meta?.icon ?? 'science'} size={24} color={theme.primary} />
                      </View>
                      <View style={styles.pickerInfo}>
                        <Text style={[styles.itemName, { color: theme.onSurface }]}>
                          {potion.name}
                        </Text>
                        <Text style={[styles.itemCount, { color: theme.onSurfaceVariant }]}>
                          {count} Owned
                        </Text>
                      </View>
                      {isEquipped && (
                        <Text style={[styles.equippedBadge, { color: theme.error }]}>
                          Equipped
                        </Text>
                      )}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    marginBottom: 32,
    marginTop: 16,
  },
  sectionHeader: {
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  description: {
    fontSize: 13,
    marginBottom: 16,
  },
  slotsRow: {
    flexDirection: 'column',
    gap: 12,
  },
  slotContainer: {
    borderRadius: 16,
    padding: 16,
  },
  slotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  slotTitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  slotMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slotInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
  },
  itemCount: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  autoUseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150,150,150,0.2)',
  },
  autoUseText: {
    fontSize: 14,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalScroll: {
    paddingBottom: 40,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
    gap: 12,
  },
  pickerInfo: {
    flex: 1,
  },
  equippedBadge: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 8,
  },
  emptyModalText: {
    textAlign: 'center',
    marginTop: 24,
    fontSize: 14,
  },
});
