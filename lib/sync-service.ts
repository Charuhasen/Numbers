import { db, getPendingTransactions, LocalInventory, LocalPotionSlot, LocalProfile, LocalStoreItem, markTransactionSynced, upsertLocalInventory, upsertLocalPotionSlots, upsertLocalProfile, upsertLocalStoreItems } from '@/lib/local-db';
import { processPendingScores } from '@/lib/score-service';
import { supabase } from '@/lib/supabase';
import NetInfo from '@react-native-community/netinfo';

export interface SyncStatus {
    isOnline: boolean;
    isSyncing: boolean;
    lastSyncedAt: Date | null;
}

/**
 * Perform a full push/pull sync with Supabase and the local SQLite database.
 * This should be called on app startup if online, or when returning to foreground.
 */
export async function syncDataWithSupabase(userId: string): Promise<void> {
    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) return;

    try {
        // 0. Push any pending scores and transactions FIRST, as it might update bits/inventory that we then pull
        await processPendingScores();
        await processPendingTransactions(userId);

        // 1. Pull Profile
        const { data: profileData } = await supabase
            .from('profiles')
            .select('id, username, display_name, bits, avatar_url, country_code')
            .eq('id', userId)
            .single();

        if (profileData) {
            upsertLocalProfile({
                id: profileData.id,
                username: profileData.username,
                display_name: profileData.display_name,
                bits: profileData.bits,
                avatar_url: profileData.avatar_url,
                country_code: profileData.country_code,
            } as LocalProfile);
        }

        // 2. Pull Inventory
        const { data: inventoryData } = await supabase
            .from('inventory')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (inventoryData) {
            upsertLocalInventory(inventoryData as LocalInventory);
        }

        // 3. Pull Potion Slots
        const { data: slotsData } = await supabase
            .from('user_potion_slots')
            .select('*')
            .eq('user_id', userId);

        if (slotsData) {
            upsertLocalPotionSlots(slotsData as LocalPotionSlot[]);
        }

        // 4. Pull Store Items
        const { data: storeItemsData } = await supabase
            .from('store_items')
            .select('*');

        if (storeItemsData) {
            // Need to stringify metadata as local db expects JSON string for it
            const localStoreItems = storeItemsData.map((item: any) => ({
                ...item,
                metadata: item.metadata ? JSON.stringify(item.metadata) : null,
            })) as LocalStoreItem[];
            upsertLocalStoreItems(localStoreItems);
        }

        // Update sync timestamp
        db.runSync(
            `INSERT INTO local_sync_meta (table_name, last_synced_at) VALUES ('all', datetime('now')) 
       ON CONFLICT(table_name) DO UPDATE SET last_synced_at = datetime('now')`
        );

    } catch (error) {
        console.error("Error pulling data from Supabase:", error);
    }
}

export function getLastSyncedAt(): Date | null {
    const row = db.getFirstSync<{ last_synced_at: string }>(
        `SELECT last_synced_at FROM local_sync_meta WHERE table_name = 'all'`
    );
    return row ? new Date(row.last_synced_at + "Z") : null;
}

let isProcessingTransactions = false;

export async function processPendingTransactions(userId: string) {
    if (isProcessingTransactions) return;
    isProcessingTransactions = true;
    try {
        const pending = getPendingTransactions(userId);
        if (!pending || pending.length === 0) return;

        for (const tx of pending) {
            if (tx.type === 'potion_used') {
                try {
                    const details = JSON.parse(tx.details);
                    const potionColumn = details.potion_column;
                    if (!potionColumn) continue;

                    const { error } = await supabase.rpc('consume_potion', { p_potion_column: potionColumn });
                    if (!error) {
                        markTransactionSynced(tx.id);
                    } else {
                        console.error("Failed to sync potion usage:", error);
                    }
                } catch (e) {
                    console.error("Error processing pending potion transaction:", e);
                }
            }
        }
    } finally {
        isProcessingTransactions = false;
    }
}
