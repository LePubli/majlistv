// Accueil de l'enfant sur la télé : bonjour, temps restant, rangées de vidéos (sa tranche d'âge, le catalogue choisi par le parent),
// histoires du soir, sortie par le code parental. Aucun menu adulte ; « Retour » de la télécommande ne quitte pas l'espace.
import React, { useEffect, useMemo } from 'react';
import { BackHandler, FlatList, ScrollView, View, useWindowDimensions } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { useAsync } from '@/lib/useAsync';
import { KC, avatarEmoji, leftMin, resolveShelves, shelfTitle } from '@/lib/kids';
import { tvCardWidth } from '@/lib/tv';
import type { KidCatalog } from '@/lib/types';
import { Txt } from '@/components/ui';
import { Focusable } from '@/components/tv/Focusable';
import { TvKidCard } from '@/components/tv/TvKidCard';

export default function TvKidsHome() {
  const { t, locale, feat } = useSession();
  const { kid, kidApi, epoch, time, setTime } = useKid();
  const { width } = useWindowDimensions();
  const w = tvCardWidth(width, 4.5);
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
  const btn = { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 20, backgroundColor: KC.surface } as const;
  const stories = feat('audyn') ? (
    <Focusable accessibilityRole="button" radius={999} onPress={() => router.push('/tv/kids/stories')} style={btn}>
      <Txt weight="extrabold" size={16} color={KC.text}>🌙 {t('aud.kTitle')}</Txt>
    </Focusable>
  ) : null;
  const exit = (first = false) => (
    <Focusable first={first} accessibilityRole="button" radius={999} onPress={() => router.push('/tv/kids/exit')} style={btn}>
      <Feather name="lock" size={18} color={KC.text2} /><Txt weight="bold" size={16} color={KC.text2}>{t('kdLeave')}</Txt>
    </Focusable>
  );
  if (tm?.timeUp) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40, backgroundColor: KC.bg }}>
        <Txt size={64} style={{ lineHeight: 78 }}>🌙</Txt>
        <Txt weight="extrabold" size={28} color={KC.text}>{t('kdTimeUpTitle')}</Txt>
        <Txt size={18} color={KC.text2} style={{ textAlign: 'center' }}>{t('kdTimeUpText')}</Txt>
        <View style={{ flexDirection: 'row', gap: 14 }}>{stories}{exit(!stories)}</View>
      </View>
    );
  }
  return (
    <ScrollView style={{ backgroundColor: KC.bg }} contentContainerStyle={{ paddingVertical: 28, gap: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 32 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: KC.surface, borderWidth: 2, borderColor: KC.line }}>
          <Txt size={34} style={{ lineHeight: 42 }}>{avatarEmoji(kid.profile.avatar)}</Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt weight="extrabold" size={24} color={KC.text}>{t('kdHello', { name: kid.profile.name })}</Txt>
          {left != null ? <Txt size={15} color={left <= 5 ? KC.accent : KC.text2}>{left <= 5 ? t('kdTimeLow', { n: left }) : t('kdTimeLeft', { n: left })}</Txt> : null}
        </View>
        {stories}
        {exit()}
      </View>
      {cat.loading && !d ? <Txt color={KC.text2} style={{ paddingHorizontal: 32 }}>…</Txt> : null}
      {cat.error && !d ? (
        <Focusable first accessibilityRole="button" radius={999} onPress={cat.reload} style={[btn, { alignSelf: 'flex-start', marginHorizontal: 32 }]}>
          <Txt weight="bold" color={KC.text}>{t('common.retry')}</Txt>
        </Focusable>
      ) : null}
      {d && rows.length === 0 ? <Txt color={KC.text2} style={{ paddingHorizontal: 32 }}>{t('kdEmpty')}</Txt> : null}
      {d ? rows.map(({ shelf, items }, ri) => (
        <View key={`${shelf.kind}-${shelf.rubricId ?? ''}`} style={{ gap: 8 }}>
          <Txt weight="extrabold" size={20} color={KC.text} style={{ paddingHorizontal: 32 }}>{shelfTitle(shelf, { t, rubrics: d.rubrics, locale })}</Txt>
          <FlatList horizontal data={items} keyExtractor={(x) => x.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 28, paddingVertical: 6 }}
            renderItem={({ item, index }) => <TvKidCard x={item} width={w} first={ri === 0 && index === 0} />} />
        </View>
      )) : null}
    </ScrollView>
  );
}
