// Accueil TV (refonte TV-R) : image à la une en plein écran, texte à gauche, boutons « Regarder » et « Ma liste », puis les rangées
// (Continuer, puis les rangées de l'accueil du site). Quand on parcourt une rangée, l'image de fond suit la vignette choisie.
// La flèche haut / bas passe d'une rangée à l'autre, gauche / droite d'une vidéo à l'autre ; la liste défile toute seule.
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { tvCardWidth, tvRows } from '@/lib/tv';
import { tvc, useTv } from '@/lib/tvTheme';
import { minutesLabel } from '@/lib/media';
import type { Card, CollectionItem, Home } from '@/lib/types';
import { Loading, Txt } from '@/components/ui';
import { TvShell } from '@/components/tv/TvShell';
import { TvRow } from '@/components/tv/TvCard';
import { TvCollectionRow } from '@/components/tv/TvCollectionCard';
import { TvBackdrop } from '@/components/tv/TvBackdrop';
import { TvButton } from '@/components/tv/TvButton';

export default function TvHome() {
  const { api, user, t, feat, inMyList, toggleMyList } = useSession();
  const { u, W } = useTv();
  const home = useAsync(() => api.get<Home>('/home'), [user?.id]);
  const cont = useAsync(async () => (user ? await api.get<Card[]>('/me/continue').catch(() => []) : []), [user?.id]);
  // Collections éditoriales (rangée sous « Continuer »), seulement si la fonction est activée.
  // Collections de l'accueil (mêmes que le site) : une rangée de vidéos par collection, après les rangées du catalogue.
  const colRows = useAsync(async () => { if (!feat('collections')) return [] as { id: string; title: string; talks: Card[] }[]; const r = await api.get<{ collections: { id: string; title: string; talks: Card[] }[] }>('/collections/home').catch(() => null); return Array.isArray(r?.collections) ? r!.collections.filter((c) => (c.talks || []).length > 0) : []; }, []);
  const cols = useAsync(async () => (feat('collections') ? await api.get<CollectionItem[]>('/collections').catch(() => [] as CollectionItem[]) : []), []);
  const rows = tvRows(home.data?.rows ?? []);
  const featured = home.data?.hero && home.data.hero.mode === 'featured' ? home.data.hero.items[0] : null;
  // Sans vidéo à la une choisie dans l'admin : la première vidéo de la première rangée.
  const hero: Card | null = featured ?? ((rows[0]?.talks?.[0] as Card | undefined) ?? null);
  const [bg, setBg] = useState<Card | null>(null);
  const pad = u(200);
  const cardW = tvCardWidth(W - pad + u(64), 4.4);
  const hasCont = !!cont.data && cont.data.length > 0;
  const canList = feat('favorites') || feat('watchlater');
  const mine = hero ? inMyList(hero.id) : false;
  const meta = hero ? [hero.speaker, minutesLabel(hero.durationSeconds, t), hero.category].filter(Boolean).join('  ·  ') : '';

  return (
    <TvShell overlay>
      {home.loading && !home.data ? <Loading /> : (
        <View style={{ flex: 1 }}>
          <TvBackdrop talk={bg ?? hero} style={{ top: 0, left: 0, right: 0, height: u(820) }} />
          <ScrollView contentContainerStyle={{ paddingBottom: u(80) }} showsVerticalScrollIndicator={false}>
            {hero ? (
              <View style={{ paddingTop: u(150), paddingStart: pad, width: pad + u(860), minHeight: u(600), gap: u(22) }}>
                <Txt weight="bold" size={u(20)} color={tvc.accentLight} style={{ letterSpacing: u(2.6), textTransform: 'uppercase' }}>
                  {featured ? t('tv.featured') : t('tv.latest')}
                </Txt>
                <Txt weight="extrabold" size={u(68)} numberOfLines={3} style={{ lineHeight: u(74) }}>{hero.title}</Txt>
                {meta ? <Txt weight="bold" size={u(24)} color={tvc.text2} numberOfLines={1}>{meta}</Txt> : null}
                {hero.summary ? <Txt size={u(26)} color={tvc.text2} numberOfLines={2} style={{ lineHeight: u(38), maxWidth: u(760) }}>{hero.summary}</Txt> : null}
                <View style={{ flexDirection: 'row', gap: u(20), marginTop: u(10) }}>
                  <TvButton first={!hasCont} label={t('tv.watch')} icon="play" onPress={() => router.push({ pathname: '/tv/talk/[id]', params: { id: hero.id } })} />
                  {canList ? (
                    <TvButton label={mine ? t('tv.inMyList') : t('tv.myList')} icon={mine ? 'check' : 'plus'}
                      onPress={() => { if (!user) router.push('/tv/account'); else void toggleMyList(hero.id); }} />
                  ) : null}
                </View>
              </View>
            ) : <View style={{ height: u(140) }} />}
            <View style={{ gap: u(36), marginTop: hero ? u(30) : 0 }}>
              {hasCont ? <TvRow title={t('tv.continue')} talks={cont.data!} cardW={cardW} padStart={pad} first onFocusTalk={setBg} /> : null}
              {(cols.data ?? []).length > 0 ? <TvCollectionRow title={t('colNav')} items={cols.data ?? []} cardW={cardW} padStart={pad} /> : null}
              {rows.map((r, i) => (
                <TvRow key={r.key} title={r.title || t('tv.featured')} talks={(r.talks ?? []) as Card[]} cardW={cardW} padStart={pad}
                  first={!hero && !hasCont && i === 0} onFocusTalk={setBg} />
              ))}
              {(colRows.data ?? []).map((c) => <TvRow key={`col-${c.id}`} title={c.title} talks={c.talks} cardW={cardW} padStart={pad} onFocusTalk={setBg} />)}
            </View>
            {!hero && rows.length === 0 ? <Txt size={u(26)} color={tvc.muted} style={{ paddingHorizontal: pad }}>{t('tv.empty')}</Txt> : null}
          </ScrollView>
        </View>
      )}
    </TvShell>
  );
}

