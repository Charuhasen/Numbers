/**
 * useGamePotions — single source of truth for all potion logic during a game.
 *
 * Snapshots the loadout ONCE at game start (slots × inventory × storeItems),
 * tracks per-potion usage counts, fires consume RPCs, and triggers auto-use
 * effects. Both GameScreen and GamePotionTray read from this hook's output
 * instead of computing their own counts.
 */

import { getAutoUseMode } from '@/constants/potions';
import { Inventory, useProfile } from '@/context/profile-ctx';
import { consumeLocalPotion, insertLocalTransaction } from '@/lib/local-db';
import { getStoreItems, type AutoUseMode, type StoreItem } from '@/lib/store-service';
import { processPendingTransactions } from '@/lib/sync-service';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Public types ────────────────────────────────────────────────────────────

/** One resolved slot ready for the game session. */
export interface ResolvedSlot {
  slotIndex: number;
  potionColumn: string;        // e.g. 'potion_time_freeze'
  sku: string;                 // store_items.sku
  autoUseMode: AutoUseMode;
  autoUseEnabled: boolean;     // user's toggle state (only matters for 'toggleable')
  initialQty: number;          // min(3, owned) — max 3 per slot, clamped to inventory
  usedCount: number;           // how many consumed this session
  remainingUses: number;       // initialQty - usedCount
}

export interface UseGamePotionsReturn {
  /** Resolved loadout — stable after init. Re-renders only when usedCount changes. */
  slots: ResolvedSlot[];
  /** True once the snapshot is ready (storeItems loaded + inventory available). */
  ready: boolean;
  /** Consume one copy of a potion by column name. Returns false if none left. */
  consumeOne: (potionColumn: string) => boolean;
  /** Look up a resolved slot by column name. */
  getSlot: (potionColumn: string) => ResolvedSlot | undefined;
  /** Current usedCounts keyed by potion column — passed straight to the tray. */
  usedCounts: Record<string, number>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useGamePotions(): UseGamePotionsReturn {
  const { profile, inventory, potionSlots, refreshProfile } = useProfile();
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [slots, setSlots] = useState<ResolvedSlot[]>([]);
  const [ready, setReady] = useState(false);
  const initializedRef = useRef(false);

  // Snapshot of initial inventory at game start — never overwritten by refreshProfile
  const initialInventoryRef = useRef<Inventory | null>(null);

  // Load store items once
  useEffect(() => {
    getStoreItems().then(setStoreItems).catch(() => { });
  }, []);

  // ─── One-time snapshot ───────────────────────────────────────────────────
  useEffect(() => {
    if (initializedRef.current) return;
    if (storeItems.length === 0 || !inventory || potionSlots.length === 0) return;
    initializedRef.current = true;
    initialInventoryRef.current = { ...inventory };

    const resolved: ResolvedSlot[] = [];

    for (const slot of potionSlots) {
      if (!slot.potion_type) continue;

      const item = storeItems.find((i) => i.sku === slot.potion_type);
      if (!item?.metadata?.column) continue;

      const column = item.metadata.column;
      const owned = inventory[column as keyof Inventory] ?? 0;
      if (owned <= 0) continue;

      // Each slot must have a unique potion — enforced by DB constraint,
      // but guard here too so we never double-count.
      if (resolved.some((r) => r.potionColumn === column)) continue;

      const autoMode = getAutoUseMode(column, storeItems);
      // Always carry up to 3 copies per slot, capped by how many the player owns
      const initialQty = Math.min(3, owned);

      resolved.push({
        slotIndex: slot.slot_index,
        potionColumn: column,
        sku: item.sku,
        autoUseMode: autoMode,
        autoUseEnabled: slot.auto_use_enabled,
        initialQty,
        usedCount: 0,
        remainingUses: initialQty,
      });
    }

    setSlots(resolved);
    setReady(true);
  }, [storeItems, inventory, potionSlots]);

  // ─── Consume one copy ────────────────────────────────────────────────────
  const consumeOne = useCallback((potionColumn: string): boolean => {
    let consumed = false;

    setSlots((prev) =>
      prev.map((s) => {
        if (s.potionColumn !== potionColumn) return s;
        if (s.remainingUses <= 0) return s;
        consumed = true;
        return {
          ...s,
          usedCount: s.usedCount + 1,
          remainingUses: s.remainingUses - 1,
        };
      }),
    );

    if (consumed && profile?.id) {
      // 1. Immediately reduce local inventory SQLite
      consumeLocalPotion(profile.id, potionColumn as any);

      // 2. Insert into local transactions queue
      const txId = Crypto.randomUUID();
      insertLocalTransaction({
        id: txId,
        user_id: profile.id,
        type: 'potion_used',
        details: JSON.stringify({ potion_column: potionColumn }),
        created_at: new Date().toISOString(),
        sync_status: 'pending',
      });

      refreshProfile(); // Trigger context update for inventory changes

      // 3. Fire-and-forget sync — don't block game logic
      processPendingTransactions(profile.id).catch(console.error);
    }

    return consumed;
  }, [profile?.id, refreshProfile]);

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const getSlot = useCallback(
    (potionColumn: string) => slots.find((s) => s.potionColumn === potionColumn),
    [slots],
  );

  // Derived usedCounts map for the tray
  const usedCounts: Record<string, number> = {};
  for (const s of slots) {
    usedCounts[s.potionColumn] = s.usedCount;
  }

  return { slots, ready, consumeOne, getSlot, usedCounts };
}
