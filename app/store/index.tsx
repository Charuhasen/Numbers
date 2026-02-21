import { Colors, Spacing } from '@/constants/theme';
import { useProfile } from '@/context/profile-ctx';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  StoreItem,
  UserInventory,
  getEffectivePrice,
  getOwnedCount,
  getStoreItems,
  getUserInventory,
  isDiscountActive,
  purchaseItem,
  type PotionRarity,
} from '@/lib/store-service';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─── Static potion display metadata ──────────────────────────────────────────

type PotionDisplayMeta = {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
};

const POTION_DISPLAY: Record<string, PotionDisplayMeta> = {
  potion_time_freeze:   { icon: 'timer',                label: 'Time Freeze'   },
  potion_second_chance: { icon: 'shield',               label: 'Second Chance' },
  potion_50_50:         { icon: 'content-cut',          label: '50/50'         },
  potion_scanner:       { icon: 'center-focus-strong',  label: 'Scanner'       },
  potion_fortune_tonic: { icon: 'auto-awesome',         label: 'Fortune Tonic' },
  potion_grid_skip:     { icon: 'skip-next',            label: 'Grid Skip'     },
  potion_revive:        { icon: 'autorenew',            label: 'Revive'        },
};

const RARITY_ORDER: PotionRarity[] = ['rare', 'epic', 'legendary'];

const RARITY_LABEL: Record<PotionRarity, string> = {
  rare:      'Rare',
  epic:      'Epic',
  legendary: 'Legendary',
};

// ─── Components ───────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.onSurfaceVariant }]}>{label}</Text>
      <View style={[styles.sectionLine, { backgroundColor: theme.outlineVariant }]} />
    </View>
  );
}

interface PotionCardProps {
  item: StoreItem;
  inventory: UserInventory;
  userBits: number;
  rarityColor: string;
  onBuy: (item: StoreItem) => void;
  buying: boolean;
}

function PotionCard({ item, inventory, userBits, rarityColor, onBuy, buying }: PotionCardProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';

  const meta = POTION_DISPLAY[item.metadata?.column ?? ''];
  const rarity = item.metadata?.rarity ?? 'rare';
  const effectivePrice = getEffectivePrice(item);
  const discounted = isDiscountActive(item);
  const owned = getOwnedCount(item, inventory);
  const canAfford = userBits >= effectivePrice;

  const iconBg = isDark
    ? `${rarityColor}22`
    : `${rarityColor}18`;

  return (
    <View style={[styles.card, { backgroundColor: theme.surfaceVariant }]}>
      {/* Icon */}
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <MaterialIcons name={meta?.icon ?? 'science'} size={26} color={rarityColor} />
      </View>

      {/* Info */}
      <View style={styles.cardInfo}>
        <View style={styles.cardNameRow}>
          <Text style={[styles.cardName, { color: theme.onSurface }]} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={[styles.rarityBadge, { backgroundColor: iconBg }]}>
            <Text style={[styles.rarityText, { color: rarityColor }]}>
              {RARITY_LABEL[rarity]}
            </Text>
          </View>
        </View>
        <Text style={[styles.cardDesc, { color: theme.onSurfaceVariant }]} numberOfLines={2}>
          {item.description}
        </Text>

        {/* Price + Buy row */}
        <View style={styles.cardFooter}>
          <View style={styles.priceBlock}>
            <MaterialIcons name="toll" size={14} color={theme.onSurfaceVariant} />
            {discounted ? (
              <>
                <Text style={[styles.originalPrice, { color: theme.onSurfaceVariant }]}>
                  {item.price_bits.toLocaleString()}
                </Text>
                <Text style={[styles.price, { color: rarityColor }]}>
                  {effectivePrice.toLocaleString()}
                </Text>
                <View style={[styles.discountBadge, { backgroundColor: rarityColor }]}>
                  <Text style={styles.discountText}>-{item.discount_percentage}%</Text>
                </View>
              </>
            ) : (
              <Text style={[styles.price, { color: theme.onSurface }]}>
                {effectivePrice.toLocaleString()}
              </Text>
            )}
          </View>

          <View style={styles.rightBlock}>
            {owned > 0 && (
              <Text style={[styles.ownedText, { color: theme.onSurfaceVariant }]}>
                Owned: {owned}
              </Text>
            )}
            <TouchableOpacity
              style={[
                styles.buyButton,
                {
                  backgroundColor: canAfford ? rarityColor : theme.surfaceDim,
                  opacity: buying ? 0.6 : 1,
                },
              ]}
              onPress={() => onBuy(item)}
              disabled={buying || !canAfford}
              activeOpacity={0.75}
            >
              {buying ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.buyText, { color: canAfford ? '#fff' : theme.onSurfaceVariant }]}>
                  Buy
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function StoreScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { profile, refreshProfile } = useProfile();

  const [items, setItems] = useState<StoreItem[]>([]);
  const [inventory, setInventory] = useState<UserInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [buying, setBuying] = useState<string | null>(null); // sku being purchased

  const load = useCallback(async () => {
    try {
      const [storeItems, inv] = await Promise.all([getStoreItems(), getUserInventory()]);
      setItems(storeItems);
      setInventory(inv);
    } catch (err) {
      Alert.alert('Error', 'Could not load store. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
    refreshProfile();
  }, [load, refreshProfile]);

  const handleBuy = useCallback(async (item: StoreItem) => {
    const effectivePrice = getEffectivePrice(item);
    const userBits = profile?.bits ?? 0;

    if (userBits < effectivePrice) {
      Alert.alert('Not enough bits', `You need ${effectivePrice.toLocaleString()} bits to buy this.`);
      return;
    }

    Alert.alert(
      `Buy ${item.name}?`,
      `This will cost ${effectivePrice.toLocaleString()} bits. You currently have ${userBits.toLocaleString()} bits.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Buy',
          onPress: async () => {
            setBuying(item.sku);
            try {
              await purchaseItem(item.sku);
              // Refresh bits balance + inventory in parallel
              await Promise.all([refreshProfile(), load()]);
            } catch (err: unknown) {
              const msg =
                err instanceof Error ? err.message : 'Purchase failed. Please try again.';
              Alert.alert('Purchase failed', msg);
            } finally {
              setBuying(null);
            }
          },
        },
      ],
    );
  }, [profile?.bits, refreshProfile, load]);

  // Group items by rarity
  const grouped = RARITY_ORDER.reduce<Record<PotionRarity, StoreItem[]>>(
    (acc, r) => {
      acc[r] = items.filter((i) => i.metadata?.rarity === r);
      return acc;
    },
    { rare: [], epic: [], legendary: [] },
  );

  const rarityColor: Record<PotionRarity, string> = {
    rare:      theme.potionRare,
    epic:      theme.potionEpic,
    legendary: theme.potionLegendary,
  };

  const userBits = profile?.bits ?? 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={theme.onSurface} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.onSurface }]}>Potion Store</Text>
        {/* Bits balance */}
        <View style={[styles.bitsChip, { backgroundColor: theme.surfaceVariant }]}>
          <MaterialIcons name="toll" size={16} color={theme.potionLegendary} />
          <Text style={[styles.bitsText, { color: theme.onSurface }]}>
            {userBits.toLocaleString()}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.primary}
            />
          }
        >
          <Text style={[styles.subtitle, { color: theme.onSurfaceVariant }]}>
            Spend your bits on potions to gain the edge in Blitz mode.
          </Text>

          {RARITY_ORDER.map((rarity) => {
            const sectionItems = grouped[rarity];
            if (sectionItems.length === 0) return null;
            return (
              <View key={rarity}>
                <SectionHeader label={RARITY_LABEL[rarity]} />
                {sectionItems.map((item) => (
                  <PotionCard
                    key={item.sku}
                    item={item}
                    inventory={inventory!}
                    userBits={userBits}
                    rarityColor={rarityColor[rarity]}
                    onBuy={handleBuy}
                    buying={buying === item.sku}
                  />
                ))}
              </View>
            );
          })}

          <View style={styles.footer}>
            <MaterialIcons name="info-outline" size={14} color={theme.onSurfaceVariant} />
            <Text style={[styles.footerText, { color: theme.onSurfaceVariant }]}>
              Earn bits by playing. Every 100 points = 1 bit.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.screenPadding,
    paddingVertical: 12,
    gap: 12,
  },
  backButton: {
    width: 36,
    alignItems: 'flex-start',
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
  },
  bitsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  bitsText: {
    fontSize: 14,
    fontWeight: '700',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: 40,
    gap: 8,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sectionLine: {
    flex: 1,
    height: 1,
  },
  // Card
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: Spacing.cardRadius,
    padding: 14,
    gap: 14,
    marginBottom: 8,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  rarityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  rarityText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  cardDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  priceBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    flexWrap: 'wrap',
  },
  price: {
    fontSize: 15,
    fontWeight: '700',
  },
  originalPrice: {
    fontSize: 12,
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  discountBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  discountText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },
  rightBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ownedText: {
    fontSize: 11,
    fontWeight: '600',
  },
  buyButton: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 10,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyText: {
    fontSize: 13,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
  },
  footerText: {
    fontSize: 12,
  },
});
