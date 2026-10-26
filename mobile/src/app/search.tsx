// Recherche : titres, intervenants, descriptions et passages de transcription, avec séries correspondantes.
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { formatClock } from '@/lib/format';
import type { SearchResult } from '@/lib/types';
import { colors, fonts, radius } from '@/lib/theme';
import { IconButton, Txt, screenStyle } from '@/components/ui';
import { TalkCard } from '@/components/TalkCard';
import { SeriesCard } from '@/components/SeriesCard';

/** Retire les balises de mise en évidence du serveur dans un extrait. */
const clean = (s: string, m: [string, string]) => s.split(m[0]).join('').split(m[1]).join('');

export default function SearchScreen() {
  const { api, t, dirStyle, isRTL } = useSession();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(null); setFailed(false); return; }
    const id = ++run.current;
    const h = setTimeout(async () => {
      setBusy(true); setFailed(false);
      try { const r = await api.get<SearchResult>('/search', { q: term, limit: 30 }); if (id === run.current) setRes(r); }
      catch { if (id === run.current) setFailed(true); }
      finally { if (id === run.current) setBusy(false); }
    }, 350);
    return () => clearTimeout(h);
  }, [q, api]);

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 }}>
        <IconButton label={t('common.close')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={20} color={colors.text} />
        </IconButton>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput autoFocus value={q} onChangeText={setQ} placeholder={t('hmSearch')} placeholderTextColor={colors.muted} returnKeyType="search" autoCorrect={false}
            accessibilityLabel={t('hmSearch')} style={{ flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 15, paddingVertical: 10, textAlign: isRTL ? 'right' : 'left' }} />
        </View>
      </View>
      {failed ? <Txt color={colors.danger} style={{ padding: 18 }}>{t('common.error')}</Txt> : null}
      {res && !res.hits.length && !res.series.length && !busy ? <Txt color={colors.muted} style={{ padding: 18 }}>{t('noTalks')}</Txt> : null}
      <FlatList
        data={res?.hits ?? []}
        keyExtractor={(x) => x.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 18 }}
        ListHeaderComponent={res?.series.length ? (
          <View style={{ gap: 10, marginBottom: 6 }}>
            <Txt weight="extrabold" size={16}>{t('seriesNav')}</Txt>
            <FlatList horizontal data={res.series} keyExtractor={(s) => s.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} renderItem={({ item }) => <SeriesCard series={item} width={170} />} />
          </View>
        ) : undefined}
        renderItem={({ item }) => (
          <View style={{ gap: 8 }}>
            <TalkCard talk={item} />
            {item.snippet && res ? <Txt size={13} color={colors.text2}>« {clean(item.snippet, res.markers)} »</Txt> : null}
            {(item.moments ?? []).map((m) => (
              <Pressable key={m.ms} accessibilityRole="button" onPress={() => router.push({ pathname: '/talk/[id]', params: { id: item.id, at: String(m.ms) } })} style={{ flexDirection: 'row', gap: 10 }}>
                <Txt weight="bold" size={12} color={colors.goldLight}>{formatClock(m.ms / 1000)}</Txt>
                <Txt size={13} color={colors.text2} style={{ flex: 1 }}>{clean(m.text, res!.markers)}</Txt>
              </Pressable>
            ))}
          </View>
        )}
      />
    </SafeAreaView>
  );
}
