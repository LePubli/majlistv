// Catalogue TV : catégories à gauche (« Toutes » + catégories principales), vidéos en grille de 4 à droite.
// Flèche droite : de la liste des catégories vers la grille ; la suite se charge en arrivant en bas (24 vidéos à la fois).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { tvCardWidth, tvMenuWidth } from '@/lib/tv';
import type { Card, Category } from '@/lib/types';
import { colors } from '@/lib/theme';
import { Loading, Txt } from '@/components/ui';
import { TvShell } from '@/components/tv/TvShell';
import { TvCard } from '@/components/tv/TvCard';
import { Focusable } from '@/components/tv/Focusable';

const PAGE = 24;
const COLS = 4;
const CATS_W = 200;

export default function TvCatalog() {
  const { api, t } = useSession();
  const { width } = useWindowDimensions();
  const cardW = tvCardWidth(width - tvMenuWidth(width) - CATS_W, COLS);
  const cats = useAsync(async () => (await api.get<Category[]>('/categories').catch(() => [])).filter((c) => c.parentId == null), []);
  const [cat, setCat] = useState<number | null>(null);
  const [items, setItems] = useState<Card[] | null>(null);
  const [end, setEnd] = useState(false);
  const busy = useRef(false);
  const gen = useRef(0);

  const load = useCallback(async (reset: boolean) => {
    if (busy.current || (!reset && end)) return;
    busy.current = true;
    const g = reset ? ++gen.current : gen.current;
    const offset = reset ? 0 : items?.length ?? 0;
    try {
      const rows = await api.get<Card[]>('/talks', { category: cat ?? undefined, limit: PAGE, offset });
      if (g !== gen.current) return;
      setItems((prev) => (reset ? rows : [...(prev ?? []), ...rows]));
      setEnd(rows.length < PAGE);
    } catch { if (reset) setItems([]); } finally { busy.current = false; }
  }, [api, cat, end, items?.length]);

  useEffect(() => { setItems(null); setEnd(false); busy.current = false; void load(true); }, [cat]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TvShell>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <ScrollView style={{ width: CATS_W, flexGrow: 0 }} contentContainerStyle={{ paddingVertical: 24, paddingHorizontal: 10, gap: 6 }}>
          <Txt weight="extrabold" size={22} style={{ paddingHorizontal: 10, paddingBottom: 8 }}>{t('tv.catalog')}</Txt>
          {[{ id: null as number | null, name: t('tv.allCategories') }, ...(cats.data ?? []).map((c) => ({ id: c.id as number | null, name: c.name }))].map((c, i) => (
            <Focusable key={String(c.id)} first={i === 0} accessibilityRole="button" accessibilityState={{ selected: cat === c.id }} onPress={() => setCat(c.id)}
              style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: cat === c.id ? colors.panel : 'transparent' }}>
              <Txt weight="bold" size={15} color={cat === c.id ? colors.goldLight : colors.text} numberOfLines={2}>{c.name}</Txt>
            </Focusable>
          ))}
        </ScrollView>
        <View style={{ flex: 1 }}>
          {items === null ? <Loading /> : items.length === 0 ? (
            <Txt color={colors.muted} style={{ padding: 32 }}>{t('tv.empty')}</Txt>
          ) : (
            <FlatList key={`g${cat}`} data={items} numColumns={COLS} keyExtractor={(x) => x.id}
              contentContainerStyle={{ padding: 28, gap: 16 }} columnWrapperStyle={{ gap: 16 }}
              onEndReached={() => { void load(false); }} onEndReachedThreshold={0.6}
              renderItem={({ item }) => <TvCard talk={item} width={cardW} />} />
          )}
        </View>
      </View>
    </TvShell>
  );
}
