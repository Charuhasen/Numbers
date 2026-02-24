import { Colors, Spacing } from '@/constants/theme';
import { useSession } from '@/context/ctx';
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
import { syncDataWithSupabase } from '@/lib/sync-service';
import { MaterialIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
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
  potion_grid_skip:     { icon: 'skip-next',            label: 'Grid Skip'     },
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
  disabled?: boolean;
}

function PotionCard({ item, inventory, userBits, rarityColor, onBuy, buying, disabled }: PotionCardProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';

  const meta = POTION_DISPLAY[item.metadata?.column ?? ''];
  const effectivePrice = getEffectivePrice(item);
  const discounted = isDiscountActive(item);
  const owned = getOwnedCount(item, inventory);
  const canAfford = userBits >= effectivePrice;

  const cardBg = isDark ? `${theme.surfaceVariant}AA` : theme.surfaceVariant;
  const imageBg = isDark ? `${rarityColor}1A` : `${rarityColor}12`;

  return (
    <View style={[styles.card, { backgroundColor: cardBg }]}>
      {/* Discount Badge */}
      {discounted && (
        <View style={[styles.discountBadge, { backgroundColor: theme.error }]}>
          <Text style={styles.discountText}>-{item.discount_percentage}%</Text>
        </View>
      )}

      {/* Potion Image Block */}
      <View style={[styles.imageContainer, { backgroundColor: imageBg }]}>
        <MaterialIcons name={meta?.icon ?? 'science'} size={48} color={rarityColor} />
        {/* Glow effect simulated with shadow on an underlying element */}
        <View style={[styles.glowLayer, { shadowColor: rarityColor }]} />
        
        {owned > 0 && (
          <View style={[styles.ownedBadge, { backgroundColor: theme.surface }]}>
            <Text style={[styles.ownedText, { color: theme.onSurface }]}>x{owned}</Text>
          </View>
        )}
      </View>

      {/* Info Block */}
      <View style={styles.infoContainer}>
        <Text style={[styles.cardName, { color: theme.onSurface }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.cardDesc, { color: theme.onSurfaceVariant }]} numberOfLines={1}>
          {/* Replace full description with a shorter punchier one based on title for the grid */}
          {meta?.label === 'Time Freeze' ? '+5s Frozen Time' :
           meta?.label === 'Second Chance' ? '+1 Mistake Forgiven' :
           meta?.label === '50/50' ? 'Hides 4 Wrong Answers' :
           meta?.label === 'Scanner' ? 'Highlights Correct Area' :
           meta?.label === 'Grid Skip' ? 'Auto-solves Grid' :
           item.name}
        </Text>
      </View>

      {/* Buy Button inside Card */}
      <TouchableOpacity
        style={[
          styles.buyButton,
          {
            backgroundColor: canAfford ? rarityColor : theme.surfaceDim,
            opacity: buying ? 0.7 : 1,
          },
        ]}
        onPress={() => onBuy(item)}
        disabled={buying || !canAfford || disabled}
        activeOpacity={0.8}
      >
        {buying ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <View style={styles.priceRow}>
            {discounted && (
              <Text style={styles.originalPriceText}>
                {item.price_bits.toLocaleString()}
              </Text>
            )}
            <MaterialIcons name="toll" size={16} color={canAfford ? '#fff' : theme.onSurfaceVariant} />
            <Text style={[styles.buyText, { color: canAfford ? '#fff' : theme.onSurfaceVariant }]}>
              {effectivePrice.toLocaleString()}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function StoreScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { profile, refreshProfile } = useProfile();
  const { session } = useSession();

  const [items, setItems] = useState<StoreItem[]>([]);
  const [inventory, setInventory] = useState<UserInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  const load = useCallback(async () => {
    const netState = await NetInfo.fetch();
    const online = !!netState.isConnected;
    setIsOnline(online);

    try {
      if (online && session?.user?.id) {
        await syncDataWithSupabase(session.user.id);
      }

      // Always load from local cache (works offline too)
      const storeItems = await getStoreItems();
      setItems(storeItems);

      if (online) {
        const inv = await getUserInventory();
        setInventory(inv);
      } else {
        // Use local inventory from profile context as fallback
        setInventory(null);
      }
    } catch (err) {
      // Still try local cache on error
      try {
        const storeItems = await getStoreItems();
        setItems(storeItems);
      } catch { /* noop */ }
      if (online) {
        Alert.alert('Error', 'Could not load store. Please try again.');
      }
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

    setBuying(item.sku);
    try {
      await purchaseItem(item.sku);
      await Promise.all([refreshProfile(), load()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Purchase failed. Please try again.';
      Alert.alert('Purchase failed', msg);
    } finally {
      setBuying(null);
    }
  }, [profile?.bits, refreshProfile, load]);

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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={theme.onSurface} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.onSurface }]}>Potion Store</Text>
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
      ) : !isOnline && items.length === 0 ? (
        <View style={styles.centered}>
          <MaterialIcons name="cloud-off" size={48} color={theme.onSurfaceVariant} style={{ marginBottom: 16 }} />
          <Text style={[styles.headerTitle, { color: theme.onSurface, marginBottom: 8 }]}>Offline</Text>
          <Text style={[styles.subtitle, { color: theme.onSurfaceVariant, textAlign: 'center', marginHorizontal: 32 }]}>
            An active internet connection is required to browse the Potion Store.
          </Text>
          <TouchableOpacity
             style={[styles.buyButton, { backgroundColor: theme.primary, width: 140, marginTop: 24 }]}
             onPress={onRefresh}
          >
             <Text style={styles.buyText}>Retry</Text>
          </TouchableOpacity>
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
          {!isOnline && (
            <View style={[styles.offlineBanner, { backgroundColor: theme.surfaceVariant }]}>
              <MaterialIcons name="cloud-off" size={16} color={theme.onSurfaceVariant} />
              <Text style={[styles.offlineBannerText, { color: theme.onSurfaceVariant }]}>
                Offline — purchases require internet
              </Text>
            </View>
          )}
          <Text style={[styles.subtitle, { color: theme.onSurfaceVariant }]}>
            Spend your bits on potions to gain the edge in Blitz mode.
          </Text>

          {RARITY_ORDER.map((rarity) => {
            const sectionItems = grouped[rarity];
            if (sectionItems.length === 0) return null;
            return (
              <View key={rarity}>
                <SectionHeader label={RARITY_LABEL[rarity]} />
                <View style={styles.gridContainer}>
                  {sectionItems.map((item) => (
                    <View key={item.sku} style={styles.gridItem}>
                      <PotionCard
                        item={item}
                        inventory={inventory ?? { potion_time_freeze: 0, potion_second_chance: 0, potion_50_50: 0, potion_grid_skip: 0, potion_scanner: 0 }}
                        userBits={userBits}
                        rarityColor={rarityColor[rarity]}
                        onBuy={handleBuy}
                        buying={buying === item.sku}
                        disabled={!isOnline}
                      />
                    </View>
                  ))}
                </View>
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
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sectionLine: {
    flex: 1,
    height: 1,
    opacity: 0.5,
  },
  
  // Grid System
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridItem: {
    width: '48%',
    // removed flexGrow/Shrink so they strictly adhere to width
  },

  // Redesigned Card
  card: {
    flex: 1, // forces item to expand vertically and match the tallest sibling in a row
    borderRadius: 20,
    padding: 10,
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '100%', // Critical for flex row height matching in RN
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  glowLayer: {
    position: 'absolute',
    width: 40,
    height: 40,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 4,
  },
  ownedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: 'center',
  },
  ownedText: {
    fontSize: 10,
    fontWeight: '800',
  },
  discountBadge: {
    position: 'absolute',
    top: -6,
    left: 8,
    zIndex: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    transform: [{ rotate: '-2deg' }],
  },
  discountText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },

  // Info Block
  infoContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 2,
    height: 40, // rigid height so short and long titles take same space
    justifyContent: 'center',
  },
  cardName: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  cardDesc: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    opacity: 0.8,
  },

  // Button
  buyButton: {
    width: '100%',
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  buyText: {
    fontSize: 15,
    fontWeight: '800',
  },
  originalPriceText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textDecorationLine: 'line-through',
    marginRight: 4,
  },

  // Offline Banner
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 8,
  },
  offlineBannerText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 32,
  },
  footerText: {
    fontSize: 12,
  },
});
