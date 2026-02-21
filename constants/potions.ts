import { MaterialIcons } from '@expo/vector-icons';

export const POTION_DISPLAY: Record<string, { icon: keyof typeof MaterialIcons.glyphMap; label: string }> = {
    potion_time_freeze: { icon: 'timer', label: 'Time Freeze' },
    potion_second_chance: { icon: 'shield', label: 'Second Chance' },
    potion_50_50: { icon: 'content-cut', label: '50/50' },
    potion_scanner: { icon: 'center-focus-strong', label: 'Scanner' },
    potion_fortune_tonic: { icon: 'auto-awesome', label: 'Fortune Tonic' },
    potion_grid_skip: { icon: 'skip-next', label: 'Grid Skip' },
    potion_revive: { icon: 'autorenew', label: 'Revive' },
};

/** Potions that support auto-use (passive activation during gameplay). */
export const AUTO_USE_POTIONS = new Set([
    'potion_time_freeze',
    'potion_second_chance',
    'potion_revive',
]);
