import { Spacing } from '@/constants/theme';
import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { SharedValue } from 'react-native-reanimated';

import { GridTile, TileFeedback } from './grid-tile';

interface GridProps {
  numbers: number[];
  feedbackValues: SharedValue<TileFeedback[]>; // UI-thread driven, avoids root re-renders
  onTap: (index: number) => void;
  disabled: boolean;
}

const GRID_PADDING = Spacing.screenPadding;
const GRID_GAP = Spacing.gridGap;

function calculateTileSize(): number {
  const screenWidth = Dimensions.get('window').width;
  return Math.floor((screenWidth - GRID_PADDING * 2 - GRID_GAP * 2) / 3);
}

export const GameGrid = React.memo(function GameGrid({
  numbers,
  feedbackValues,
  onTap,
  disabled,
}: GridProps) {
  const tileSize = useMemo(calculateTileSize, []);

  const rows = useMemo(() => [
    numbers.slice(0, 3),
    numbers.slice(3, 6),
    numbers.slice(6, 9),
  ], [numbers]);

  return (
    <View style={styles.grid}>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.row}>
          {row.map((num, colIdx) => {
            const idx = rowIdx * 3 + colIdx;
            return (
              <GridTile
                key={idx}
                number={num}
                tileIndex={idx}
                feedbackValues={feedbackValues}
                onTap={onTap}
                disabled={disabled}
                size={tileSize}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  grid: {
    gap: GRID_GAP,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: GRID_GAP,
  },
});
