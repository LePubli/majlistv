// Accueil de l'espace enfant : bonjour, temps restant, recherche, rubriques, rangées de suggestions. Les vidéos sont celles de la tranche d'âge
// du profil et du catalogue choisi par le parent ; rien ne mène hors de l'espace (sortie : code parental).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { useAsync } from '@/lib/useAsync';
import { KC, ageFilter, avatarEmoji, leftMin, resolveShelves, rubricName, searchTerm, shelfTitle } from '@/lib/kids';
import type { KidCard, KidCatalog } from '@/lib/types';
import { KButton, KChip, KScreen, KTxt, KidVideoCard } from '@/components/kids/KidUi';

const open = (id: string) => router.push({ pathname: '/kids/watch/[id]', params: { id } });

export default function KidsHome() {
  const { t, locale, isRTL } = useSession();
  const { kid, kidApi, epoch, time, setTime } = useKid();
  const { width } = useWindowDimensions();
  const cardW = Math.round(Math.min(280, Math.max(160, (width - 40) / (width >= 700 ? 3.2 : 1.7))));
  const cat = useAsync(async () => {
    const d = await kidApi.get<KidCatalog>('/kids/catalog');
    if (d.time) setTime(d.time);
    return d;
  }, [kid?.profile.id, epoch]); // eslint-disable-line react-hooks/exhaustive-deps
  const [q, setQ] = useState('');
  const [found, setFound] = useState<KidCard[] | null>(null);
  const [rubric, setRubric] = useState<number | null>(null);
  const [mine, setMine] = useState(false);
  const seq = useRef(0);

  // Recherche : 300 ms après la dernière lettre ; la réponse la plus récente gagne.
  useEffect(() => {
    const term = searchTerm(q);
    if (!term) { setFound(null); return undefined; }
    const n = ++seq.current;
    const h = setTimeout(() => {
      kidApi.get<{ talks: KidCard[] }>('/kids/search', { q: term, rubric: rubric ?? undefined })
        .then((r) => { if (n === seq.current) setFound(r.talks); }).catch(() => { if (n === seq.current) setFound([]); });
    }, 300);
    return () => clearTimeout(h);
  }, [q, rubric, kidApi]);

  const d = cat.data;
  const band = kid?.profile.band ?? '';
  const rows = useMemo(() => (d ? resolveShelves(d.shelves, d.talks, mine, band) : []), [d, mine, band]);
  if (!kid) return <Redirect href="/kids" />;

  const tm = d?.time ?? time;
  const left = leftMin(tm);
  const searching = !!searchTerm(q);
  const chosen = d?.rubrics.find((r) => r.id === rubric) ?? null;
  const grid = (list: KidCard[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 20 }}>
      {list.map((x) => <View key={x.id} style={{ width: width >= 700 ? '31%' : '47.5%' }}><KidVideoCard x={x} onPress={() => open(x.id)} /></View>)}
    </View>
  );

  if (tm?.timeUp) {
    return (
      <KScreen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28 }} accessibilityRole="alert">
          <KTxt size={56} style={{ lineHeight: 68 }}>🌙</KTxt>
          <KTxt weight="extrabold" size={24} style={{ textAlign: 'center' }}>{t('kdTimeUpTitle')}</KTxt>
          <KTxt style={{ textAlign: 'center' }} color={KC.text2}>{t('kdTimeUpText')}</KTxt>
          <KButton label={t('kdLeave')} variant="soft" icon={<Feather name="lock" size={18} color={KC.text} />} onPress={() => router.push('/kids/exit')} />
        </View>
      </KScreen>
    );
  }

  return (
    <KScreen>
      <ScrollView contentContainerStyle={{ gap: 18, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: KC.surface, borderWidth: 2, borderColor: KC.line }}>
            <KTxt size={30} style={{ lineHeight: 38 }}>{avatarEmoji(kid.profile.avatar)}</KTxt>
          </View>
          <View style={{ flex: 1 }}>
            <KTxt weight="extrabold" size={20} numberOfLines={2} accessibilityRole="header">{t('kdHello', { name: kid.profile.name })}</KTxt>
            {left != null ? <KTxt size={13} color={left <= 5 ? KC.accent : KC.text2}>{left <= 5 ? t('kdTimeLow', { n: left }) : t('kdTimeLeft', { n: left })}</KTxt> : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('kdLeave')} hitSlop={8} onPress={() => router.push('/kids/exit')}
            style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: KC.surface, borderWidth: 2, borderColor: KC.line }}>
            <Feather name="lock" size={20} color={KC.text2} />
          </Pressable>
        </View>

        <View style={{ marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 56, borderRadius: 28, backgroundColor: KC.surface, borderWidth: 2, borderColor: KC.line }}>
          <Feather name="search" size={20} color={KC.muted} />
          <TextInput accessibilityLabel={t('kcSearchLabel')} placeholder={t('kcSearchPh')} placeholderTextColor={KC.muted} value={q} onChangeText={setQ} maxLength={80} autoCorrect={false} returnKeyType="search"
            style={{ flex: 1, color: KC.text, fontSize: 16, minHeight: 52, textAlign: isRTL ? 'right' : 'left' }} />
          {q ? <Pressable accessibilityRole="button" accessibilityLabel={t('kdHide')} hitSlop={8} onPress={() => setQ('')}><Feather name="x" size={20} color={KC.muted} /></Pressable> : null}
        </View>

        {d && d.rubrics.length ? (
          <FlatList horizontal data={[null, ...d.rubrics]} keyExtractor={(r) => String(r?.id ?? 'all')} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}
            renderItem={({ item: r }) => r
              ? <KChip label={`${r.emoji} ${rubricName(r, locale)}`} active={rubric === r.id} onPress={() => setRubric(rubric === r.id ? null : r.id)} />
              : <KChip label={t('kcAll')} active={rubric === null} onPress={() => setRubric(null)} />} />
        ) : null}
        <View style={{ paddingHorizontal: 20, flexDirection: 'row' }}>
          <KChip label={`${mine ? '✓ ' : ''}${t('kcOnlyMyAge')}`} active={mine} onPress={() => setMine(!mine)} />
        </View>

        {cat.loading && !d ? <KTxt style={{ paddingHorizontal: 20 }} color={KC.text2}>…</KTxt> : null}
        {cat.error && !d ? <View style={{ paddingHorizontal: 20, gap: 12 }}><KTxt color={KC.text2}>{t('common.error')}</KTxt><KButton label={t('common.retry')} variant="soft" onPress={cat.reload} /></View> : null}

        {searching ? (
          <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
            <KTxt weight="extrabold" size={20} style={{ paddingHorizontal: 20 }}>{t('kcResults')}</KTxt>
            {found === null ? <KTxt style={{ paddingHorizontal: 20 }} color={KC.text2}>…</KTxt>
              : ageFilter(found, mine, band).length === 0 ? <KTxt style={{ paddingHorizontal: 20 }} color={KC.text2}>{t('kcNothing')}</KTxt> : grid(ageFilter(found, mine, band))}
          </View>
        ) : chosen && d ? (
          <View style={{ gap: 12 }}>
            <KTxt weight="extrabold" size={20} style={{ paddingHorizontal: 20 }}>{chosen.emoji} {rubricName(chosen, locale)}</KTxt>
            {(() => { const list = ageFilter(d.talks.filter((x) => x.rubricIds.includes(chosen.id)), mine, band); return list.length ? grid(list) : <KTxt style={{ paddingHorizontal: 20 }} color={KC.text2}>{t('kcNothing')}</KTxt>; })()}
          </View>
        ) : d ? (
          rows.length === 0 ? <KTxt style={{ paddingHorizontal: 20 }} color={KC.text2}>{t('kdEmpty')}</KTxt> : rows.map(({ shelf, items }) => (
            <View key={`${shelf.kind}-${shelf.rubricId ?? ''}`} style={{ gap: 10 }}>
              <KTxt weight="extrabold" size={20} accessibilityRole="header" style={{ paddingHorizontal: 20 }}>{shelfTitle(shelf, { t, rubrics: d.rubrics, locale })}</KTxt>
              <FlatList horizontal data={items} keyExtractor={(x) => x.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 20 }}
                renderItem={({ item }) => <KidVideoCard x={item} width={cardW} onPress={() => open(item.id)} />} />
            </View>
          ))
        ) : null}
        <KTxt size={12} color={KC.muted} style={{ paddingHorizontal: 20, textAlign: 'center' }}>{t('kids.lockHint')}</KTxt>
      </ScrollView>
    </KScreen>
  );
}
