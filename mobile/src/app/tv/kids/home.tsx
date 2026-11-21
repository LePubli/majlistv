// Accueil de l'enfant sur la télé : bonjour, temps restant, rangées de vidéos (sa tranche d'âge, le catalogue choisi par le parent),
// histoires du soir, sortie par le code parental. Aucun menu adulte ; « Retour » de la télécommande ne quitte pas l'espace.
import React, { useEffect, useMemo } from 'react';
import { BackHandler, FlatList, ScrollView, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { useAsync } from '@/lib/useAsync';
import { KC, avatarEmoji, leftMin, resolveShelves, shelfKey, shelfTitle } from '@/lib/kids';
import { useTv } from '@/lib/tvTheme';
import { thumbOf } from '@/lib/media';
import { formatDuration } from '@/lib/format';
import type { KidCatalog } from '@/lib/types';
import { Txt } from '@/components/ui';
import { TvButton } from '@/components/tv/TvButton';
import { TvBackdrop } from '@/components/tv/TvBackdrop';
import { TvKidCard } from '@/components/tv/TvKidCard';

export default function TvKidsHome() {
  const { t, locale, feat, dirStyle } = useSession();
  const { u } = useTv();
  const { kid, kidApi, epoch, time, setTime } = useKid();
  const cat = useAsync(async () => {
    const d = await kidApi.get<KidCatalog>('/kids/catalog');
    if (d.time) setTime(d.time);
    return d;
  }, [kid?.profile.id, epoch]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const s = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => s.remove();
  }, []);
  const d = cat.data;
  const rows = useMemo(() => (d ? resolveShelves(d.shelves, d.talks, false, kid?.profile.band ?? '') : []), [d, kid?.profile.band]);
  if (!kid) return <Redirect href="/tv/kids" />;
  const tm = d?.time ?? time;
  const left = leftMin(tm);
  const pad = u(96);
  const acc = { accent: KC.accent, onAccent: KC.onAccent };
  const stories = (first = false) => feat('audyn') ? <TvButton first={first} label={t('aud.kTitle')} icon="moon" onPress={() => router.push('/tv/kids/stories')} {...acc} /> : null;
  const exit = (first = false) => <TvButton first={first} label={t('kdLeave')} icon="lock" onPress={() => router.push('/tv/kids/exit')} {...acc} />;
  if (tm?.timeUp) {
    return (
      <View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: u(30), padding: pad, backgroundColor: KC.bg }, dirStyle]}>
        <Feather name="moon" size={u(110)} color={KC.accent} />
        <Txt weight="extrabold" size={u(60)} color={KC.text}>{t('kdTimeUpTitle')}</Txt>
        <Txt size={u(30)} color={KC.text2} style={{ textAlign: 'center', maxWidth: u(1100), lineHeight: u(44) }}>{t('kdTimeUpText')}</Txt>
        <View style={{ flexDirection: 'row', gap: u(18) }}>{stories(true)}{exit(!feat('audyn'))}</View>
      </View>
    );
  }
  // Grande vidéo en haut : celle qu'il a commencée, sinon la première de la première rangée.
  const all = rows.flatMap((r) => r.items);
  const hero = all.find((x) => x.positionMs > 0 && !x.completed) ?? all[0] ?? null;
  const heroUri = hero ? thumbOf({ posterUrl: hero.posterUrl, source: hero.source as 'upload', video_ref: undefined }) : null;
  const w = u(360);
  return (
    <View style={[{ flex: 1, backgroundColor: KC.bg }, dirStyle]}>
      {heroUri ? <TvBackdrop uri={heroUri} bg={KC.bg} side={0.55} style={{ top: 0, end: 0, width: u(1300), height: u(680) }} /> : null}
      <ScrollView contentContainerStyle={{ paddingTop: u(54), paddingBottom: u(80), gap: u(36) }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(18), paddingHorizontal: pad }}>
          <View style={{ width: u(72), height: u(72), borderRadius: u(36), alignItems: 'center', justifyContent: 'center', backgroundColor: KC.accent }}>
            <Txt size={u(38)} style={{ lineHeight: u(46) }}>{avatarEmoji(kid.profile.avatar)}</Txt>
          </View>
          <Txt weight="extrabold" size={u(40)} color={KC.text} style={{ flex: 1 }} numberOfLines={1}>{t('kdHello', { name: kid.profile.name })}</Txt>
          {left != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(12), height: u(60), paddingHorizontal: u(24), borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' }}>
              <Feather name="clock" size={u(24)} color={KC.accent} />
              <Txt weight="bold" size={u(22)} color={left <= 5 ? KC.accent : KC.text}>{left <= 5 ? t('kdTimeLow', { n: left }) : t('kdTimeLeft', { n: left })}</Txt>
            </View>
          ) : null}
          {stories()}
          {exit(!hero && !cat.error)}
        </View>
        {hero ? (
          <View style={{ paddingHorizontal: pad, paddingTop: u(60), paddingBottom: u(40), gap: u(20), maxWidth: u(1000) }}>
            <Txt weight="extrabold" size={u(24)} color={KC.accent} style={{ letterSpacing: u(1.4), textTransform: 'uppercase' }}>{hero.positionMs > 0 ? t('tv.kidsResume') : t('tv.kidsPick')}</Txt>
            <Txt weight="extrabold" size={u(62)} color={KC.text} numberOfLines={2} style={{ lineHeight: u(68) }}>{hero.title}</Txt>
            {hero.durationSeconds ? <Txt weight="bold" size={u(26)} color={KC.text2}>{formatDuration(hero.durationSeconds)}</Txt> : null}
            <View style={{ flexDirection: 'row', marginTop: u(10) }}>
              <TvButton first big label={hero.positionMs > 0 ? t('tv.resume') : t('tv.watch')} icon="play" onPress={() => router.push({ pathname: '/tv/kids/watch/[id]', params: { id: hero.id } })} {...acc} />
            </View>
          </View>
        ) : null}
        {cat.loading && !d ? <Txt size={u(26)} color={KC.text2} style={{ paddingHorizontal: pad }}>…</Txt> : null}
        {cat.error && !d ? <View style={{ paddingHorizontal: pad, flexDirection: 'row' }}><TvButton first label={t('common.retry')} icon="refresh-cw" onPress={cat.reload} {...acc} /></View> : null}
        {d && rows.length === 0 ? <Txt size={u(26)} color={KC.text2} style={{ paddingHorizontal: pad }}>{t('kdEmpty')}</Txt> : null}
        {d ? rows.map(({ shelf, items }) => (
          <View key={shelfKey(shelf)} style={{ gap: u(14) }}>
            <Txt weight="extrabold" size={u(34)} color={KC.text} style={{ paddingHorizontal: pad }}>{shelfTitle(shelf, { t, rubrics: d.rubrics, locale })}</Txt>
            <FlatList horizontal data={items} keyExtractor={(x) => x.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: u(28), paddingStart: pad, paddingEnd: pad, paddingVertical: u(14) }}
              renderItem={({ item }) => <TvKidCard x={item} width={w} />} />
          </View>
        )) : null}
      </ScrollView>
    </View>
  );
}
