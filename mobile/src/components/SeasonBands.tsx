// Étape M3 — Bandeaux de l'accueil, comme sur le site :
//  - saison en cours (Ramadan, Hajj, Mawlid, Achoura…, étape 45) : réglée dans Admin → Saisons, affichée pendant la période et quelques jours avant ;
//  - vendredi (étape 45C) : seulement le vendredi (heure de Paris) et si Admin → Vendredi est activé ; lien vers Al-Kahf, rappels.
// Chacun suivi de sa rangée de conférences quand une collection est choisie. Rien ne s'affiche hors période.
import React, { useCallback } from 'react';
import { Linking, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { SITE_URL } from '@/lib/config';
import { SEASON_ICON, seasonWhen, type Friday, type Season } from '@/lib/athkar';
import { colors, radius } from '@/lib/theme';
import { Button, Txt } from './ui';
import { Rail } from './Rail';
import { TalkCard } from './TalkCard';

// Fonction (et non constante) : les couleurs suivent le thème en cours.
const band = () => ({ marginHorizontal: 16, padding: 16, gap: 10, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.goldLine } as const);

export function SeasonBand() {
  const { api, t, locale, feat } = useSession();
  const s = useAsync(async () => (feat('seasons') ? (await api.get<{ season: Season }>('/seasons/current', { lang: locale }, false).catch(() => ({ season: null }))).season : null), [locale, feat('seasons')]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { void s.reload(); }, [locale])); // eslint-disable-line react-hooks/exhaustive-deps
  const x = s.data;
  if (!x) return null;
  const ramadan = x.id === 'ramadan' && feat('ramadan');
  return (
    <>
      <View style={[band(), { borderColor: colors.gold }]} accessibilityLabel={x.name}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 30 }} accessibilityElementsHidden importantForAccessibility="no">{SEASON_ICON[x.id] || '☪'}</Text>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt weight="extrabold" size={18} accessibilityRole="header">{x.title}</Txt>
            <Txt weight="bold" size={12} color={colors.goldLight}>{seasonWhen(x, t)}</Txt>
          </View>
        </View>
        {x.text ? <Txt size={14} color={colors.text2}>{x.text}</Txt> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {/* Ramadan : écran de l'application à l'étape M4 ; en attendant, la page du site. */}
          {ramadan ? <Button label={t('rzNav')} onPress={() => { void Linking.openURL(`${SITE_URL}/ramadan`); }} /> : null}
          {x.collection ? <Button label={t('seasonSee')} variant={ramadan ? 'dark' : 'gold'} onPress={() => router.push({ pathname: '/collections/[id]', params: { id: x.collection!.id } })} /> : null}
        </View>
      </View>
      {x.talks.length > 0 ? <Rail title={x.collection?.title || x.title} items={x.talks} render={(c, w) => <TalkCard talk={c} width={w} />} /> : null}
    </>
  );
}

export function FridayBand() {
  const { api, t, locale, feat } = useSession();
  const f = useAsync(async () => (feat('friday') ? await api.get<Friday>('/friday', { lang: locale }, false).catch(() => ({ active: false as const })) : null), [locale, feat('friday')]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { void f.reload(); }, [locale])); // eslint-disable-line react-hooks/exhaustive-deps
  const x = f.data;
  if (!x || !x.active) return null;
  const kahf = x.kahf?.ready && feat('quran') ? x.kahf : null;
  return (
    <>
      <View style={band()} accessibilityLabel={t('fdTitle')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 30 }} accessibilityElementsHidden importantForAccessibility="no">🕌</Text>
          <Txt weight="extrabold" size={18} accessibilityRole="header" style={{ flex: 1 }}>{t('fdTitle')}</Txt>
        </View>
        {x.ghusl ? <Txt size={14} color={colors.text2}>{x.ghusl}</Txt> : null}
        {x.salawat ? <Txt size={14} color={colors.text2}>{x.salawat}</Txt> : null}
        {kahf ? <Button label={t('fdKahf')} onPress={() => router.push({ pathname: '/quran/[n]', params: { n: String(kahf.n) } })} /> : null}
      </View>
      {x.talks.length > 0 ? <Rail title={x.collection?.title || t('fdRow')} items={x.talks} render={(c, w) => <TalkCard talk={c} width={w} />} /> : null}
    </>
  );
}
