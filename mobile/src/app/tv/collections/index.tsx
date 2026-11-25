// Collections sur la télé : image de fond de la collection choisie, son titre et sa description à gauche,
// puis une rangée par type (cycles, séries d'un intervenant, thèmes du moment). Flèches : haut / bas change de rangée, gauche / droite de carte.
import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { tvCardWidth } from '@/lib/tv';
import { tvc, useTv } from '@/lib/tvTheme';
import type { CollectionItem } from '@/lib/types';
import { Loading, Txt } from '@/components/ui';
import { TvShell } from '@/components/tv/TvShell';
import { TvBackdrop } from '@/components/tv/TvBackdrop';
import { TvCollectionRow } from '@/components/tv/TvCollectionCard';
import { kindLabel, kindPlural, videosLabel } from '@/components/CollectionCard';

const KINDS = ['cycle', 'speaker', 'theme'];

export default function TvCollections() {
  const { api, t } = useSession();
  const { u, W } = useTv();
  const list = useAsync(() => api.get<CollectionItem[]>('/collections').catch(() => [] as CollectionItem[]), []);
  const items = list.data ?? [];
  const [sel, setSel] = useState<CollectionItem | null>(null);
  const cur = sel ?? items.find((c) => c.pinned && c.posterUrl) ?? items.find((c) => c.posterUrl) ?? items[0] ?? null;
  const pad = u(200);
  const cardW = tvCardWidth(W - pad + u(64), 4.4);
  const groups = useMemo(() => KINDS.map((k) => ({ k, rows: items.filter((c) => c.kind === k) })).filter((g) => g.rows.length), [items]);
  return (
    <TvShell overlay>
      {list.loading && !list.data ? <Loading /> : (
        <View style={{ flex: 1 }}>
          <TvBackdrop uri={cur?.posterUrl ?? null} talk={cur ? { id: cur.id } : null} style={{ top: 0, left: 0, right: 0, height: u(820) }} />
          <ScrollView contentContainerStyle={{ paddingBottom: u(80) }} showsVerticalScrollIndicator={false}>
            {cur ? (
              <View style={{ paddingTop: u(150), paddingStart: pad, width: pad + u(860), minHeight: u(560), gap: u(22) }}>
                <Txt weight="bold" size={u(20)} color={tvc.accentLight} style={{ letterSpacing: u(2.6), textTransform: 'uppercase' }}>{cur.pinned ? t('colPinned') : kindLabel(cur.kind ?? '', t)}</Txt>
                <Txt weight="extrabold" size={u(68)} numberOfLines={3} style={{ lineHeight: u(74) }}>{cur.title}</Txt>
                {cur.description ? <Txt size={u(26)} color={tvc.text2} numberOfLines={3} style={{ lineHeight: u(38), maxWidth: u(760) }}>{cur.description}</Txt> : null}
                <Txt weight="bold" size={u(24)} color={tvc.text2}>{videosLabel(cur.talks, t)}</Txt>
              </View>
            ) : <View style={{ height: u(140) }} />}
            <View style={{ gap: u(36), marginTop: cur ? u(30) : 0 }}>
              {groups.map((g, i) => (
                <TvCollectionRow key={g.k} title={kindPlural(g.k, t)} items={g.rows} cardW={cardW} padStart={pad} first={i === 0} onFocusItem={setSel} />
              ))}
            </View>
            {!cur ? <Txt size={u(26)} color={tvc.muted} style={{ paddingHorizontal: pad }}>{t('colNone')}</Txt> : null}
          </ScrollView>
        </View>
      )}
    </TvShell>
  );
}
