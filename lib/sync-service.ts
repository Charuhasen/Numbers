import {
  db,
  deleteLocalPotionSlot,
  getPendingChanges,
  getPendingTransactions,
  LocalInventory,
  LocalPotionSlot,
  LocalProfile,
  LocalStoreItem,
  markChangesSynced,
  markTransactionSynced,
  pruneSyncedData,
  upsertLocalInventory,
  upsertLocalPotionSlots,
  upsertLocalProfile,
  upsertLocalScore,
  upsertLocalStoreItems,
  type PendingChange,
} from '@/lib/local-db';
import { processPendingScores } from '@/lib/score-service';
import { supabase } from '@/lib/supabase';
import NetInfo from '@react-native-community/netinfo';

export interface SyncResult {
  success: boolean;
  scoresSynced: number;
  transactionsSynced: number;
  error?: string;
}

/**
 * Perform a full push/pull sync with Supabase and the local SQLite database.
 * This should be called on app startup if online, or when returning to foreground.
 */
export async function syncDataWithSupabase(userId: string): Promise<SyncResult> {
  const netInfo = await NetInfo.fetch();
  if (!netInfo.isConnected) {
    return { success: false, scoresSynced: 0, transactionsSynced: 0, error: 'offline' };
  }

  let scoresSynced = 0;
  let transactionsSynced = 0;

  try {
    // 0. Push any pending scores, transactions, and changes FIRST
    scoresSynced = await processPendingScores();
    transactionsSynced = await processPendingTransactions(userId);
    await processPendingChanges(userId);

    // 1. Pull all data in parallel
    const [profileResult, inventoryResult, slotsResult, storeResult, scoresResult] = await Promise.all([
      supabase.from('profiles').select('id, username, display_name, bits, avatar_url, country_code').eq('id', userId).single(),
      supabase.from('inventory').select('*').eq('user_id', userId).single(),
      supabase.from('user_potion_slots').select('*').eq('user_id', userId),
      supabase.from('store_items').select('*'),
      supabase.from('scores').select('id, user_id, score, mode, round_reached, played_at').eq('user_id', userId),
    ]);

    if (profileResult.data) {
      upsertLocalProfile(profileResult.data as LocalProfile);
    }

    if (inventoryResult.data) {
      upsertLocalInventory(inventoryResult.data as LocalInventory);
    }

    if (slotsResult.data) {
      upsertLocalPotionSlots(slotsResult.data as LocalPotionSlot[]);
    }

    if (storeResult.data) {
      const localStoreItems = storeResult.data.map((item: any) => ({
        ...item,
        metadata: item.metadata ? JSON.stringify(item.metadata) : null,
      })) as LocalStoreItem[];
      upsertLocalStoreItems(localStoreItems);
    }

    // Pull remote scores into local DB so getLocalBestScores reflects server data
    if (scoresResult.data) {
      for (const row of scoresResult.data) {
        upsertLocalScore(row);
      }
    }

    // Prune old synced data
    pruneSyncedData();

    // Update sync timestamp
    db.runSync(
      `INSERT INTO local_sync_meta (table_name, last_synced_at) VALUES ('all', datetime('now'))
       ON CONFLICT(table_name) DO UPDATE SET last_synced_at = datetime('now')`
    );

    return { success: true, scoresSynced, transactionsSynced };
  } catch (error) {
    console.error("Error syncing data with Supabase:", error);
    return {
      success: false,
      scoresSynced,
      transactionsSynced,
      error: error instanceof Error ? error.message : 'Unknown sync error',
    };
  }
}

export function getLastSyncedAt(): Date | null {
  const row = db.getFirstSync<{ last_synced_at: string }>(
    `SELECT last_synced_at FROM local_sync_meta WHERE table_name = 'all'`
  );
  return row ? new Date(row.last_synced_at + "Z") : null;
}

let isProcessingTransactions = false;

export async function processPendingTransactions(userId: string): Promise<number> {
  if (isProcessingTransactions) return 0;
  isProcessingTransactions = true;
  let synced = 0;
  try {
    const pending = getPendingTransactions(userId);
    if (!pending || pending.length === 0) return 0;

    for (const tx of pending) {
      if (tx.type === 'potion_used') {
        // potion_used requires an RPC call to consume on the server
        try {
          const details = JSON.parse(tx.details);
          const potionColumn = details.potion_column;
          if (!potionColumn) continue;

          const { error } = await supabase.rpc('consume_potion', { p_potion_column: potionColumn });
          if (!error) {
            markTransactionSynced(tx.id);
            synced++;
          } else {
            console.error("Failed to sync potion usage:", error);
          }
        } catch (e) {
          console.error("Error processing pending potion transaction:", e);
        }
      } else {
        // bits_earned, potion_drop, purchase are audit-only — server already processed these
        // via submit_game_score or purchase_item_with_bits RPCs. Just mark synced.
        markTransactionSynced(tx.id);
        synced++;
      }
    }
  } finally {
    isProcessingTransactions = false;
  }
  return synced;
}

/** Process queued offline changes (potion slots, settings toggles, username). */
export async function processPendingChanges(userId: string): Promise<void> {
  const changes = getPendingChanges();
  if (changes.length === 0) return;

  const syncedIds: number[] = [];

  for (const change of changes) {
    try {
      const payload = JSON.parse(change.payload);
      let success = false;

      switch (change.change_type) {
        case 'potion_slot': {
          if (payload.action === 'delete') {
            const { error } = await supabase
              .from('user_potion_slots')
              .delete()
              .eq('user_id', userId)
              .eq('slot_index', payload.slot_index);
            success = !error;
          } else {
            const { error } = await supabase
              .from('user_potion_slots')
              .upsert({
                user_id: userId,
                slot_index: payload.slot_index,
                potion_type: payload.potion_type,
                auto_use_enabled: payload.auto_use_enabled,
                quantity: payload.quantity,
              });
            success = !error;
          }
          break;
        }
        case 'friend_requests_toggle': {
          const { error } = await supabase
            .from('profiles')
            .update({ allow_friend_requests: payload.value })
            .eq('id', userId);
          success = !error;
          break;
        }
        case 'username': {
          const { error } = await supabase
            .from('profiles')
            .update({ username: payload.username })
            .eq('id', userId);
          success = !error;
          break;
        }
      }

      if (success) {
        syncedIds.push(change.id);
      }
    } catch (e) {
      console.error(`Failed to process pending change ${change.id}:`, e);
    }
  }

  if (syncedIds.length > 0) {
    markChangesSynced(syncedIds);
  }
}
