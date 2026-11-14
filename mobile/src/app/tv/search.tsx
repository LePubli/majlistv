// Recherche TV : champ en haut (OK ouvre le clavier de la télé, ou la dictée vocale si la télécommande l'a), résultats en grille.
// Recherche lancée 0,4 s après la dernière lettre (au moins 2 caractères) ; mêmes résultats que la recherche du site.
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, TextInput, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { tvCardWidth, tvMenuWidth } from '@/lib/tv';
import type { SearchResult } from '@/lib/types';
import { colors, fonts } from '@/lib/theme';
import { Loading, Txt } from '@/components/ui';
import { TvShell } from '@/components/tv/TvShell';
import { TvCard } from '@/components/tv/TvCard';

const COLS = 4;

export default function TvSearch() {
  const { api, t } = useSession();
  const { width } = useWindowDimensions();
  const cardW = tvCardWidth(width - tvMenuWidth(width), COLS);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState(false);
  const run = useRef(0);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(null); return undefined; }
    const id = ++run.current;
    const h = setTimeout(async () => {
      setBusy(true);
      try { const r = await api.get<SearchResult>('/search', { q: term, limit: 40 }); if (id === run.current) setRes(r); }
      catch { if (id === run.current) setRes({ total: 0, hits: [], series: [], markers: ['', ''] }); }
      finally { if (id === run.current) setBusy(false); }
    }, 400);
    return () => clearTimeout(h);
  }, [q, api]);
  return (
    <TvShell>
      <View style={{ padding: 28, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 18, borderRadius: 999, backgroundColor: colors.panel, borderWidth: 3, borderColor: focus ? colors.gold : colors.border }}>
          <Feather name="search" size={22} color={colors.goldLight} />
          <TextInput value={q} onChangeText={setQ} placeholder={t('tv.searchPh')} placeholderTextColor={colors.muted} hasTVPreferredFocus autoFocus={false}
            onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} returnKeyType="search" autoCorrect={false}
            style={{ flex: 1, color: colors.text, fontSize: 20, fontFamily: fonts.medium, paddingVertical: 10 }} />
        </View>
      </View>
      {busy && !res ? <Loading /> : res ? (
        res.hits.length === 0 ? <Txt color={colors.muted} style={{ paddingHorizontal: 32 }}>{t('tv.noResult')}</Txt> : (
          <FlatList data={res.hits} numColumns={COLS} keyExtractor={(x) => x.id} contentContainerStyle={{ padding: 28, gap: 16 }} columnWrapperStyle={{ gap: 16 }}
            ListHeaderComponent={<Txt size={15} color={colors.text2} style={{ paddingBottom: 6 }}>{t('tv.results').replace('{n}', String(res.total))}</Txt>}
            renderItem={({ item }) => <TvCard talk={item} width={cardW} />} />
        )
      ) : <Txt color={colors.muted} style={{ paddingHorizontal: 32 }}>{t('tv.searchHelp')}</Txt>}
    </TvShell>
  );
}
