import { type AutoUseMode, type StoreItem } from '@/lib/store-service';
import { MaterialIcons } from '@expo/vector-icons';

export const POTION_DISPLAY: Record<string, { icon: keyof typeof MaterialIcons.glyphMap; label: string }> = {
    potion_time_freeze: { icon: 'timer', label: 'Time Freeze' }, // Blue (Rare)
    potion_second_chance: { icon: 'shield', label: 'Second Chance' }, // Green (Uncommon)
    potion_50_50: { icon: 'content-cut', label: '50/50' }, // Purple (Epic)
    potion_scanner: { icon: 'center-focus-strong', label: 'Scanner' }, // Amber (Legendary)
    potion_grid_skip: { icon: 'skip-next', label: 'Grid Skip' }, // Red (God Tier)
};

/**
 * Resolve the auto-use mode for a potion column.
 * Reads from the store item's `metadata.auto_use_mode` (DB-driven).
 * Falls back to hardcoded defaults if the field is missing (e.g. stale cache).
 */
export function getAutoUseMode(potionColumn: string, storeItems: StoreItem[]): AutoUseMode {
    const item = storeItems.find((i) => i.metadata?.column === potionColumn);
    if (item?.metadata?.auto_use_mode) return item.metadata.auto_use_mode;
    // Fallback defaults — only used if DB hasn't been migrated yet
    return FALLBACK_AUTO_USE_MODE[potionColumn] ?? 'manual';
}

const FALLBACK_AUTO_USE_MODE: Record<string, AutoUseMode> = {
    potion_second_chance: 'always',
    potion_time_freeze: 'toggleable',
};
