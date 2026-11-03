// Étape M2 — Le Coran : programme « 30 jours », recherche dans le texte / les traductions / la phonétique, et les 114 sourates.
// Mêmes données que la page /coran du site (GET /quran/suras, /quran/search). Gratuit pour tous.
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { arLabel, filterSuras, type SearchHit, type SuraInfo, type SurasResponse } from '@/lib/quran';
import { colors, fonts, radius } from '@/lib/theme';
import { ErrorBox, Loading, ScreenHeader, Txt, screenStyle } from '@/components/ui';
import { QuranPlan } from '@/components/QuranPlan';

export default function QuranHome() {
  const { api, t, locale, feat, dirStyle, isRTL } = useSession();
  const d = useAsync(() => api.get<SurasResponse>('/quran/suras', undefined, false), []);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [filter, setFilter] = useState('');

  // Recherche après une courte pause de frappe (comme le site).
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) { setHits(null); return undefined; }
    let dead = false;
    const h = setTimeout(() => {
      api.get<{ results: SearchHit[] }>('/quran/search', { q: s, lang: locale }, false).then((r) => { if (!dead) setHits(r.results); }).catch(() => { if (!dead) setHits([]); });
    }, 350);
    return () => { dead = true; clearTimeout(h); };
  }, [q, locale, api]);

  const input = {
    minHeight: 48, borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel2,
    paddingHorizontal: 16, color: colors.text, fontFamily: fonts.medium, fontSize: 15, textAlign: (isRTL ? 'right' : 'left') as 'right' | 'left',
  };
  const ready = !!d.data?.ready;
  const list = d.data ? filterSuras(d.data.suras, filter) : [];

  const header = (
    <View style={{ gap: 14, paddingBottom: 6 }}>
      <Txt size={14} color={colors.text2}>{t('qrIntro')}</Txt>
      {d.data && !ready ? <Txt color={colors.goldLight}>{t('qrSoon')}</Txt> : null}
      {ready && feat('quranplan') ? <QuranPlan /> : null}
      {ready ? (
        <>
          <TextInput value={q} onChangeText={setQ} placeholder={t('qrSearch')} placeholderTextColor={colors.muted} maxLength={80}
            accessibilityLabel={t('qrSearch')} returnKeyType="search" style={input} />
          {hits ? (
            <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
              {hits.length === 0 ? <Txt color={colors.muted}>{t('qrNoResult')}</Txt> : hits.map((x) => (
                <Pressable key={`${x.sura}:${x.aya}`} accessibilityRole="link" onPress={() => router.push({ pathname: '/quran/[n]', params: { n: String(x.sura), aya: String(x.aya) } })}
                  style={({ pressed }) => ({ padding: 12, gap: 6, borderRadius: radius.card, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderSoft, opacity: pressed ? 0.85 : 1 })}>
                  <Txt size={12} color={colors.muted}>{x.name} · {x.sura}:{x.aya}</Txt>
                  {x.ar ? <Txt style={{ fontFamily: 'Amiri_400Regular', fontSize: 22, lineHeight: 42, textAlign: 'right', writingDirection: 'rtl' }}>{x.ar}</Txt> : null}
                  {x.tr ? <Txt size={14} color={colors.text2}>{x.tr}</Txt> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
          <TextInput value={filter} onChangeText={setFilter} placeholder={t('qrFilter')} placeholderTextColor={colors.muted} maxLength={40}
            accessibilityLabel={t('qrFilter')} style={input} />
        </>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top', 'bottom']}>
      <ScreenHeader title={t('qrTitle')} />
      {d.loading && !d.data ? <Loading /> : !d.data ? <ErrorBox onRetry={d.reload} /> : (
        <FlatList
          data={ready ? list : []}
          keyExtractor={(s) => String(s.n)}
          ListHeaderComponent={header}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 48 }}
          renderItem={({ item }) => <SuraRow s={item} />}
          onRefresh={d.reload}
          refreshing={false}
        />
      )}
    </SafeAreaView>
  );
}

function SuraRow({ s }: { s: SuraInfo }) {
  const { t } = useSession();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${t('qrSura')} ${s.n}, ${s.en}${s.verses ? ', ' + t('qrVerses', { n: s.verses }) : ''}`}
      onPress={() => router.push({ pathname: '/quran/[n]', params: { n: String(s.n) } })}
      style={({ pressed }) => ({
        minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8,
        borderRadius: radius.card, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderSoft, opacity: pressed ? 0.85 : 1,
      })}>
      <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.goldTint }}>
        <Txt weight="bold" size={14} color={colors.goldLight} style={{ writingDirection: 'ltr' }}>{s.n}</Txt>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt weight="bold" size={15} numberOfLines={1}>{s.en}</Txt>
        <Txt size={12} color={colors.muted}>{s.verses ? t('qrVerses', { n: s.verses }) : '—'}</Txt>
      </View>
      {/* Nom arabe d'un seul tenant (arLabel) : « آل عمران » s'affichait coupé sur Android. */}
      <Text numberOfLines={1} accessibilityLanguage="ar"
        style={{ flexShrink: 0, paddingHorizontal: 4, fontFamily: 'Amiri_700Bold', fontSize: 22, lineHeight: 38, color: colors.text, textAlign: 'right', writingDirection: 'rtl', includeFontPadding: false }}>
        {arLabel(s.ar)}
      </Text>
    </Pressable>
  );
}
