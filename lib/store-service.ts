import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PotionRarity = 'rare' | 'epic' | 'legendary';

export interface StoreItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  price_bits: number;
  price_fiat: number | null;
  type: 'potion' | 'heart_refill' | 'bundle' | 'bits_pack';
  metadata: {
    column: string;
    qty: number;
    rarity: PotionRarity;
  } | null;
  is_active: boolean;
  discount_percentage: number;
  discount_ends_at: string | null;
  created_at: string;
}

export interface UserInventory {
  potion_time_freeze: number;
  potion_second_chance: number;
  potion_heart_refill: number;
  potion_50_50: number;
  potion_grid_skip: number;
  potion_revive: number;
  potion_fortune_tonic: number;
  potion_scanner: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the price the player would actually pay, accounting for active discounts. */
export function getEffectivePrice(item: StoreItem): number {
  if (
    item.discount_percentage > 0 &&
    (!item.discount_ends_at || new Date(item.discount_ends_at) > new Date())
  ) {
    return Math.floor(item.price_bits * (1 - item.discount_percentage / 100));
  }
  return item.price_bits;
}

export function isDiscountActive(item: StoreItem): boolean {
  return (
    item.discount_percentage > 0 &&
    (!item.discount_ends_at || new Date(item.discount_ends_at) > new Date())
  );
}

/** How many of this item the player owns (reads from inventory via metadata.column). */
export function getOwnedCount(item: StoreItem, inventory: UserInventory): number {
  const col = item.metadata?.column as keyof UserInventory | undefined;
  if (!col) return 0;
  return inventory[col] ?? 0;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function getStoreItems(): Promise<StoreItem[]> {
  const { data, error } = await supabase
    .from('store_items')
    .select('*')
    .eq('is_active', true)
    .order('price_bits', { ascending: true });

  if (error) throw error;
  return (data ?? []) as StoreItem[];
}

export async function getUserInventory(): Promise<UserInventory> {
  const { data, error } = await supabase
    .from('inventory')
    .select(
      'potion_time_freeze, potion_second_chance, potion_heart_refill, potion_50_50, potion_grid_skip, potion_revive, potion_fortune_tonic, potion_scanner',
    )
    .single();

  if (error) throw error;
  return data as UserInventory;
}

export async function purchaseItem(
  sku: string,
): Promise<{ success: boolean; new_balance: number }> {
  const { data, error } = await supabase.rpc('purchase_item_with_bits', {
    item_sku: sku,
  });

  if (error) throw error;
  return data as { success: boolean; new_balance: number };
}
