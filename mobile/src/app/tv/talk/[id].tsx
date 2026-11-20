// Fiche d'une vidéo sur la télé (refonte TV-R) : grande image à droite, titre, intervenant, durée, description ;
// « Reprendre à 8:12 » / « Regarder », « Depuis le début », « Ma liste » ; chapitres (OK = lecture depuis ce chapitre).
// Vidéo réservée aux abonnés : message, QR code de la page d'abonnement du site et « J'ai pris l'abonnement » (relit la fiche).
// Contenu à l'unité : prix et QR code (TvSale). Pas encore connecté : « Se connecter ».
import React from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { SITE_URL } from '@/lib/config';
import { minutesLabel, thumbOf } from '@/lib/media';
import { tvClock, tvResumeSeconds } from '@/lib/tv';
import { tvc, useTv } from '@/lib/tvTheme';
import type { Card, Insights, Talk } from '@/lib/types';
import { ErrorBox, Loading, Txt } from '@/components/ui';
import { Focusable } from '@/components/tv/Focusable';
import { TvButton } from '@/components/tv/TvButton';
import { TvBackdrop } from '@/components/tv/TvBackdrop';
import { TvRow } from '@/components/tv/TvCard';
import { TvSale } from '@/components/tv/TvSale';
import { QrCode } from '@/components/tv/QrCode';
import { SalePill } from '@/components/SaleCard';

export default function TvTalk() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, user, t, locale, feat, inMyList, toggleMyList, dirStyle } = useSession();
  const { u, W } = useTv();
  const talk = useAsync(() => api.get<Talk>(`/talks/${id}`), [id, user?.id]);
  const tok = talk.data?.playbackToken;
  const more = useAsync(async () => (await api.get<Card[]>('/talks', { limit: 13 }).catch(() => [] as Card[])).filter((c) => c.id !== id).slice(0, 12), [id]);
  const ins = useAsync(async () => (tok ? await api.get<Insights>(`/talks/${id}/insights`, { t: tok, lang: locale }).catch(() => null) : null), [id, tok, locale]);
  if (talk.loading && !talk.data) return <View style={{ flex: 1, backgroundColor: tvc.bg }}><Loading /></View>;
  if (!talk.data) return <View style={{ flex: 1, backgroundColor: tvc.bg }}><ErrorBox onRetry={talk.reload} /></View>;
  const x = talk.data;
  const resume = tvResumeSeconds(x.resumeMs, x.durationSeconds);
  const pct = resume && x.durationSeconds ? Math.min(1, resume / x.durationSeconds) : 0;
  const play = (from: number) => router.push({ pathname: '/tv/play/[id]', params: { id: x.id, at: String(from) } });
  const chapters = ins.data?.chapters ?? [];
  const canList = feat('favorites') || feat('watchlater');
  const mine = inMyList(x.id);
  const meta = [x.speaker, minutesLabel(x.durationSeconds, t)].filter(Boolean);
  const pad = u(96);
  const site = SITE_URL.replace(/^https?:\/\//, '');
  const locked = !!x.locked;

  return (
    <View style={[{ flex: 1, backgroundColor: tvc.bg }, dirStyle]}>
      <TvBackdrop talk={x} side={locked ? 0.9 : 0.5} style={locked ? { top: 0, bottom: 0, left: 0, right: 0, opacity: 0.6 } : { top: 0, end: 0, width: u(1300), height: u(760) }} />
      <ScrollView contentContainerStyle={{ paddingTop: u(54), paddingBottom: u(60), gap: u(40) }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: pad, flexDirection: 'row', gap: u(60), alignItems: 'flex-start' }}>
          <View style={{ width: Math.min(u(980), W - pad * 2 - (locked ? u(380) : 0)), gap: u(22), paddingTop: u(100) }}>
            {locked ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(12) }}>
                <Feather name="lock" size={u(22)} color={tvc.kids} />
                <Txt weight="bold" size={u(20)} color={tvc.kids} style={{ letterSpacing: u(2.6), textTransform: 'uppercase' }}>{t('tv.lockedTitle')}</Txt>
              </View>
            ) : x.category ? <Txt weight="bold" size={u(20)} color={tvc.accentLight} style={{ letterSpacing: u(2.6), textTransform: 'uppercase' }}>{x.category}</Txt> : null}
            <Txt weight="extrabold" size={u(66)} numberOfLines={3} style={{ lineHeight: u(70) }}>{x.title}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: u(16) }}>
              {meta.map((m, i) => <Txt key={i} weight="bold" size={u(24)} color={tvc.text2}>{i ? `•  ${m}` : m}</Txt>)}
              {x.tracks && x.tracks.length > 1 ? (
                <View style={{ paddingVertical: u(5), paddingHorizontal: u(12), borderRadius: u(8), borderWidth: u(2), borderColor: tvc.faint }}>
                  <Txt weight="bold" size={u(18)} color={tvc.text2}>{x.tracks.map((l) => l.toUpperCase()).join(' · ')}</Txt>
                </View>
              ) : null}
              {x.quiz?.available ? (
                <View style={{ paddingVertical: u(5), paddingHorizontal: u(12), borderRadius: u(8), backgroundColor: tvc.accent }}><Txt weight="bold" size={u(18)}>{t('tv.quiz')}</Txt></View>
              ) : null}
            </View>
            <SalePill sale={x.sale} />
            {x.description ? <Txt size={u(25)} color={tvc.text2} numberOfLines={locked ? 3 : 4} style={{ lineHeight: u(37), maxWidth: u(840) }}>{x.description}</Txt> : null}
            {locked && !x.sale ? <Txt size={u(26)} color={tvc.text} style={{ lineHeight: u(38), maxWidth: u(820) }}>{user ? t('tv.locked') : t('tv.lockedGuest')}</Txt> : null}
            {pct > 0 && !locked ? (
              <View style={{ width: u(560), gap: u(10) }}>
                <View style={{ height: u(6), borderRadius: u(3), backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
                  <View style={{ width: `${pct * 100}%`, height: u(6), backgroundColor: tvc.accent }} />
                </View>
                <Txt weight="bold" size={u(20)} color={tvc.muted}>{t('tv.leftMin', { n: Math.max(1, Math.ceil(((x.durationSeconds || 0) - resume) / 60)) })}</Txt>
              </View>
            ) : null}
            {x.locked && x.sale ? (
              <TvSale kind="talk" id={x.id} sale={x.sale} onRefresh={talk.reload} />
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u(18), marginTop: u(6) }}>
              {!locked ? (
                <>
                  <TvButton first label={resume ? t('tv.resumeAt', { t: tvClock(resume) }) : t('tv.watch')} icon="play" onPress={() => play(resume)} />
                  {resume ? <TvButton label={t('tv.fromStart')} icon="rotate-ccw" onPress={() => play(0)} /> : null}
                </>
              ) : !user ? (
                <TvButton first label={t('tv.login')} icon="log-in" onPress={() => router.push('/tv/account')} />
              ) : !x.sale ? (
                <TvButton first label={t('tv.iSubscribed')} icon="refresh-cw" onPress={talk.reload} />
              ) : null}
              {locked ? <TvButton label={t('tv.otherVideos')} icon="grid" onPress={() => router.replace('/tv/catalog')} /> : null}
              {canList && user ? (
                <TvButton label={mine ? t('tv.inMyList') : t('tv.myList')} icon={mine ? 'check' : 'plus'} onPress={() => { void toggleMyList(x.id); }} />
              ) : null}
            </View>
          </View>
          {locked && user && !x.sale ? (
            <View style={{ marginTop: u(200), alignItems: 'center', gap: u(20), padding: u(34), borderRadius: u(28), backgroundColor: 'rgba(13,30,53,0.92)', borderWidth: 1, borderColor: 'rgba(143,169,204,0.25)' }}>
              <View style={{ padding: u(14), backgroundColor: '#fff', borderRadius: u(18) }}><QrCode value={`${SITE_URL}/pricing`} size={u(220)} /></View>
              <Txt weight="bold" size={u(24)} style={{ textAlign: 'center', maxWidth: u(280) }}>{t('tv.subscribeQr')}</Txt>
              <Txt size={u(20)} color={tvc.muted}>{site}</Txt>
            </View>
          ) : null}
        </View>

        {chapters.length > 0 && !locked ? (
          <View style={{ gap: u(16) }}>
            <Txt weight="extrabold" size={u(30)} style={{ paddingHorizontal: pad }}>{t('tv.chaptersTitle')}</Txt>
            <FlatList horizontal data={chapters} keyExtractor={(c, i) => `${i}-${c.s}`} showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: pad, gap: u(26), paddingVertical: u(12) }}
              renderItem={({ item, index }) => (
                <Focusable ring={false} scale={1.05} radius={u(18)} accessibilityRole="button" accessibilityLabel={`${t('tv.chapterN', { n: index + 1 })} · ${item.t}`}
                  onPress={() => play(Math.floor(item.s / 1000))}>
                  {(on) => (
                    <View style={{ width: u(400), flexDirection: 'row', alignItems: 'center', gap: u(18), padding: u(14), borderRadius: u(18), backgroundColor: on ? tvc.text : 'rgba(255,255,255,0.06)' }}>
                      <View style={{ width: u(160), height: u(90), borderRadius: u(12), overflow: 'hidden', backgroundColor: tvc.panel }}>
                        {thumbOf(x) ? <Image source={{ uri: thumbOf(x)! }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" /> : null}
                        <View style={{ position: 'absolute', start: u(8), bottom: u(8), paddingVertical: u(4), paddingHorizontal: u(8), borderRadius: u(6), backgroundColor: 'rgba(6,16,34,0.85)' }}>
                          <Txt weight="bold" size={u(16)}>{tvClock(item.s / 1000)}</Txt>
                        </View>
                      </View>
                      <View style={{ flex: 1, gap: u(6) }}>
                        <Txt weight="bold" size={u(18)} color={on ? tvc.accent : tvc.accentLight}>{t('tv.chapterN', { n: index + 1 })}</Txt>
                        <Txt weight="bold" size={u(22)} color={on ? tvc.onLight : tvc.text} numberOfLines={2}>{item.t}</Txt>
                      </View>
                    </View>
                  )}
                </Focusable>
              )} />
          </View>
        ) : null}

        {more.data && more.data.length > 0 ? (
          <TvRow title={t('tv.moreVideos')} talks={more.data} cardW={u(380)} padStart={pad} />
        ) : null}
      </ScrollView>
    </View>
  );
}
