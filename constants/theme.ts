/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * The palette is based on the UI Design Specification.
 */

import { Platform } from 'react-native';

const tintColorLight = '#7C8B9A'; // primary
const tintColorDark = '#9AACBE'; // primary dark

export const Colors = {
  light: {
    // Standard template keys (backward compatibility)
    text: '#3A3A3A',
    background: '#F5F0EB',
    tint: tintColorLight,
    icon: '#8A8580',
    tabIconDefault: '#8A8580',
    tabIconSelected: tintColorLight,

    // Design System Tokens
    surface: '#F5F0EB',
    surfaceVariant: '#EDE8E2',
    surfaceDim: '#E5DFD8',
    primary: '#7C8B9A',
    primaryContainer: '#6B7A89',
    onSurface: '#3A3A3A',
    onSurfaceVariant: '#8A8580',
    onPrimary: '#FFFFFF',
    error: '#C4897A',
    errorContainer: '#D4A99A',
    success: '#8BA89A',
    successContainer: '#A3BDAF',
    heart: '#C48A7A',
    heartEmpty: '#DDD5CD',
    potionRare: '#7C8B9A',
    potionEpic: '#9A7CB0',
    potionLegendary: '#B09A5C',
  },
  dark: {
    // Standard template keys (backward compatibility)
    text: '#E8E4E0',
    background: '#2A2825',
    tint: tintColorDark,
    icon: '#9A9590',
    tabIconDefault: '#9A9590',
    tabIconSelected: tintColorDark,

    // Design System Tokens
    surface: '#2A2825',
    surfaceVariant: '#353230',
    surfaceDim: '#1E1D1B',
    primary: '#9AACBE',
    primaryContainer: '#6B7A89',
    onSurface: '#E8E4E0',
    onSurfaceVariant: '#9A9590',
    onPrimary: '#2A2825',
    error: '#C4897A',
    errorContainer: '#935F55',
    success: '#8BA89A',
    successContainer: '#5A7568',
    heart: '#C48A7A',
    heartEmpty: '#5A5550',
    potionRare: '#9AACBE',
    potionEpic: '#B89BCE',
    potionLegendary: '#D4BE80',
  },
};

export const Typography = {
  headlineLarge: {
    fontSize: 28,
    fontWeight: '600' as const,
  },
  headlineMedium: {
    fontSize: 22,
    fontWeight: '500' as const,
  },
  titleMedium: {
    fontSize: 16,
    fontWeight: '500' as const,
  },
  titleSmall: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  labelLarge: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  labelMedium: {
    fontSize: 12,
    fontWeight: '400' as const,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  labelSmall: {
    fontSize: 10,
    fontWeight: '400' as const,
  },
  bodyLarge: {
    fontSize: 16,
    fontWeight: '400' as const,
  },
  displayLarge: {
    fontSize: 36,
    fontWeight: '700' as const,
  },
};

export const Spacing = {
  screenPadding: 24,
  gridGap: 12,
  cardRadius: 16,
  tileRadius: 12,
  buttonRadius: 12,
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
