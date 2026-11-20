// Catalogue TV (refonte TV-R) : titre, catégories en pilules sur une ligne (« Toutes » + catégories principales), vidéos en grille
// de 4 dessous. Flèche bas : des catégories vers la grille ; la suite se charge en arrivant en bas (24 vidéos à la fois).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { minutesLabel } from '@/lib/media';
import { tvc, useTv } from '@/lib/tvTheme';
import type { Card, Category } from '@/lib/types';
import { Loading, Txt } from '@/components/ui';
import { TvShell } from '@/components/tv/TvShell';
import { TvCard } from '@/components/tv/TvCard';
import { Focusable } from '@/components/tv/Focusable';

const PAGE = 24;
const COLS = 4;

export default function TvCatalog() {
  const { api, t } = useSession();
  const { u, W, rail } = useTv();
  const pad = u(88);
  const gap = u(32);
  const cardW = Math.floor((W - rail - pad - u(96) - gap * (COLS - 1)) / COLS);
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

  const list = [{ id: null as number | null, name: t('tv.allCategories') }, ...(cats.data ?? []).map((c) => ({ id: c.id as number | null, name: c.name }))];
  const header = (
    <View style={{ gap: u(28), paddingTop: u(54) }}>
      <Txt weight="extrabold" size={u(52)} style={{ paddingHorizontal: pad }}>{t('tv.catalog')}</Txt>
      <FlatList horizontal data={list} keyExtractor={(c) => String(c.id)} showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: pad, gap: u(14), paddingVertical: u(8) }}
        renderItem={({ item: c, index }) => {
          const sel = cat === c.id;
          return (
            <Focusable first={index === 0} ring={false} scale={1.05} radius={999} accessibilityRole="tab" accessibilityState={{ selected: sel }} onPress={() => setCat(c.id)}>
              {(on) => (
                <View style={{ height: u(60), paddingHorizontal: u(28), borderRadius: 999, justifyContent: 'center', backgroundColor: on || sel ? tvc.text : tvc.glassSoft, borderWidth: u(5), borderColor: on ? tvc.halo : 'transparent' }}>
                  <Txt weight="bold" size={u(22)} color={on || sel ? tvc.onLight : tvc.text2} numberOfLines={1}>{c.name}</Txt>
                </View>
              )}
            </Focusable>
          );
        }} />
    </View>
  );

  return (
    <TvShell>
      {header}
      {items === null ? <Loading /> : (
        <FlatList data={items} numColumns={COLS} keyExtractor={(x) => x.id} style={{ flex: 1 }}
          ListEmptyComponent={<Txt size={u(26)} color={tvc.muted} style={{ paddingHorizontal: pad }}>{t('tv.empty')}</Txt>}
          contentContainerStyle={{ paddingTop: u(26), paddingBottom: u(80), gap: u(40) }} columnWrapperStyle={{ gap, paddingHorizontal: pad }}
          onEndReached={() => { void load(false); }} onEndReachedThreshold={0.6}
          renderItem={({ item }) => <TvCard talk={item} width={cardW} meta={[item.speaker, minutesLabel(item.durationSeconds, t)].filter(Boolean).join(' · ')} />} />
      )}
    </TvShell>
  );
}
