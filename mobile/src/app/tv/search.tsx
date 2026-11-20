// Recherche TV (refonte TV-R) : clavier à l'écran à gauche (lettres de la langue, chiffres, espace, effacer), résultats en grille
// de 3 à droite. Le champ reste un vrai champ : OK dessus ouvre le clavier de la télé ou la dictée vocale si la télécommande l'a.
// Recherche lancée 0,4 s après la dernière lettre (au moins 2 caractères) ; mêmes résultats que la recherche du site.
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { tvKeyApply, tvKeyboardKeys } from '@/lib/tv';
import { tvc, useTv } from '@/lib/tvTheme';
import { fonts } from '@/lib/theme';
import { minutesLabel } from '@/lib/media';
import type { SearchResult } from '@/lib/types';
import { Loading, Txt } from '@/components/ui';
import { TvShell } from '@/components/tv/TvShell';
import { TvCard } from '@/components/tv/TvCard';
import { Focusable } from '@/components/tv/Focusable';

const COLS = 3;

function Key({ label, onPress, flex, first, a11y }: { label: string; onPress: () => void; flex?: number; first?: boolean; a11y?: string }) {
  const { u } = useTv();
  return (
    <Focusable first={first} ring={false} scale={1.06} radius={u(14)} accessibilityRole="button" accessibilityLabel={a11y ?? label} onPress={onPress} style={{ flex: flex ?? 1 }}>
      {(on) => (
        <View style={{ height: u(68), borderRadius: u(14), alignItems: 'center', justifyContent: 'center', backgroundColor: on ? tvc.text : tvc.glassSoft, borderWidth: u(4), borderColor: on ? tvc.halo : 'transparent' }}>
          <Txt weight="bold" size={u(label.length > 1 ? 22 : 26)} color={on ? tvc.onLight : tvc.text}>{label}</Txt>
        </View>
      )}
    </Focusable>
  );
}

export default function TvSearch() {
  const { api, t, locale } = useSession();
  const { u, W, rail } = useTv();
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

  const keys = tvKeyboardKeys(locale);
  const rows: string[][] = [];
  for (let i = 0; i < keys.length; i += 6) rows.push(keys.slice(i, i + 6));
  const press = (k: string) => setQ((v) => tvKeyApply(v, k));
  const pad = u(88);
  const kbW = u(520);
  const resLeft = pad + kbW + u(80);
  const gap = u(28);
  const cardW = Math.floor((W - rail - resLeft - u(96) - gap * (COLS - 1)) / COLS);

  return (
    <TvShell>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ width: kbW, marginStart: pad, paddingTop: u(54), gap: u(22) }}>
          <Txt weight="bold" size={u(20)} color={tvc.muted} style={{ letterSpacing: u(2.4), textTransform: 'uppercase' }}>{t('tv.search')}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(16), height: u(80), paddingHorizontal: u(24), borderRadius: u(18), backgroundColor: tvc.panel, borderWidth: u(3), borderColor: focus ? tvc.text : tvc.line }}>
            <Feather name="search" size={u(28)} color={tvc.muted} />
            <TextInput value={q} onChangeText={setQ} placeholder={t('tv.searchPh')} placeholderTextColor={tvc.faint} autoFocus={false}
              onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} returnKeyType="search" autoCorrect={false} accessibilityLabel={t('tv.search')}
              style={{ flex: 1, color: tvc.text, fontSize: u(32), fontFamily: fonts.semibold, paddingVertical: 0 }} />
          </View>
          <View style={{ gap: u(10) }}>
            {rows.map((r, ri) => (
              <View key={ri} style={{ flexDirection: 'row', gap: u(10) }}>
                {r.map((k, ki) => <Key key={k} label={k} first={ri === 0 && ki === 0} onPress={() => press(k)} />)}
                {r.length < 6 ? Array.from({ length: 6 - r.length }, (_, i) => <View key={`e${i}`} style={{ flex: 1 }} />) : null}
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: u(10) }}>
              <Key label={t('tv.kbSpace')} onPress={() => press('space')} />
              <Key label={t('tv.kbDelete')} onPress={() => press('del')} />
              <Key label={t('tv.kbClear')} onPress={() => press('clear')} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(12) }}>
            <Feather name="mic" size={u(22)} color={tvc.muted} />
            <Txt size={u(20)} color={tvc.muted} style={{ flex: 1, lineHeight: u(28) }}>{t('tv.kbVoice')}</Txt>
          </View>
        </View>

        <View style={{ flex: 1, marginStart: u(80) }}>
          {busy && !res ? <Loading /> : res ? (
            <FlatList data={res.hits} numColumns={COLS} keyExtractor={(x) => x.id}
              contentContainerStyle={{ paddingTop: u(54), paddingEnd: u(96), paddingBottom: u(80), gap: u(36) }} columnWrapperStyle={{ gap }}
              ListHeaderComponent={<Txt weight="extrabold" size={u(30)} style={{ paddingBottom: u(4) }}>{res.hits.length ? t('tv.resultsFor', { n: res.total, q: q.trim() }) : t('tv.noResult')}</Txt>}
              renderItem={({ item }) => <TvCard talk={item} width={cardW} meta={[item.speaker, minutesLabel(item.durationSeconds, t)].filter(Boolean).join(' · ')} />} />
          ) : (
            <View style={{ paddingTop: u(54), paddingEnd: u(96), gap: u(16) }}>
              <Txt weight="extrabold" size={u(30)}>{t('tv.searchTitle')}</Txt>
              <Txt size={u(24)} color={tvc.muted} style={{ lineHeight: u(34) }}>{t('tv.searchHelp')}</Txt>
            </View>
          )}
        </View>
      </View>
    </TvShell>
  );
}
