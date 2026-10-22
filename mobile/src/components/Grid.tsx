// Grille de vignettes (2 colonnes sur téléphone, davantage sur tablette) pour conférences et séries.
import React from 'react';
import { View, useWindowDimensions } from 'react-native';

export function Grid<T extends { id: string }>({ items, render }: { items: T[]; render: (item: T, width: number) => React.ReactElement }) {
  const { width } = useWindowDimensions();
  const cols = width >= 1000 ? 5 : width >= 700 ? 4 : width >= 480 ? 3 : 2;
  const gap = 12;
  const w = Math.floor((width - 32 - gap * (cols - 1)) / cols);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {items.map((x) => <View key={x.id} style={{ width: w }}>{render(x, w)}</View>)}
    </View>
  );
}
