// Audyn : liste des livres audio (mêmes données que la page du site, étape 3). Recherche et catégories.
// « Continuer l'écoute » : les livres commencés sur ce téléphone (position gardée par le lecteur), les plus récents d'abord.
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { continueCandidates, fmtLong, listenState, type AudynDetail, type AudynList, type Resume } from '@/lib/audyn';
import { useAudyn } from '@/lib/audynPlayer';
import { colors, fonts, radius } from '@/lib/theme';
import { Button, Chip, ErrorBox, Loading, ScreenHeader, Txt, screenStyle } from '@/components/ui';
import { Cover } from '@/components/AudynParts';

export default function AudynHome() {
  const { api, t, dirStyle, isRTL } = useSession();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [cat, setCat] = useState('');
  useEffect(() => { const h = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(h); }, [q]);
  const d = useAsync(() => api.get<AudynList>('/audyn', { q: debounced, category: cat }), [debounced, cat]);
  const au = useAudyn();
  const [cont, setCont] = useState<{ book: AudynDetail; st: NonNullable<ReturnType<typeof listenState>> }[]>([]);
  // Rangée « Continuer l'écoute » : seulement sur la liste complète (sans recherche ni catégorie).
  const full = Boolean(d.data && !debounced && !cat);
  useEffect(() => {
    if (!full || !d.data) return undefined;
    let alive = true;
    (async () => {
      const saved: Record<string, Resume | null> = {};
      for (const it of d.data!.items) saved[it.id] = (await au.savedFor(it.id)) as Resume | null;
      const rows = await Promise.all(continueCandidates(d.data!.items, saved).map(async ({ item, saved: s }) => {
        try {
          const book = await api.get<AudynDetail>(`/audyn/${item.id}`);
          const st = listenState(book.chapters, s);
          return st ? { book, st } : null;
        } catch { return null; }
      }));
      if (alive) setCont(rows.filter((x): x is { book: AudynDetail; st: NonNullable<ReturnType<typeof listenState>> } => Boolean(x)));
    })();
    return () => { alive = false; };
  }, [full, d.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const resume = async (book: AudynDetail) => { router.push('/audyn/player'); await au.openResume(book); };

  const header = (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      <Txt size={14} color={colors.text2}>{t('aud.intro')}</Txt>
      <TextInput value={q} onChangeText={setQ} placeholder={t('aud.search')} placeholderTextColor={colors.muted} maxLength={80}
        accessibilityLabel={t('aud.search')} returnKeyType="search"
        style={{ minHeight: 48, borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel2, paddingHorizontal: 16, color: colors.text, fontFamily: fonts.medium, fontSize: 15, textAlign: isRTL ? 'right' : 'left' }} />
      {full && cont.length > 0 ? (
        <View style={{ gap: 8 }} accessibilityLabel={t('aud.continue')}>
          <Txt weight="extrabold" size={17}>{t('aud.continue')}</Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
            {cont.map(({ book, st }) => (
              <View key={book.id} style={{ width: 160, gap: 6, padding: 10, borderRadius: radius.card, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderSoft }}>
                <Pressable accessibilityRole="link" accessibilityLabel={book.title} onPress={() => router.push({ pathname: '/audyn/[id]', params: { id: book.id } })} style={{ gap: 6 }}>
                  <Cover url={book.coverUrl} size={138} />
                  <Txt weight="bold" size={14} numberOfLines={2}>{book.title}</Txt>
                </Pressable>
                <Txt size={12} color={colors.muted} numberOfLines={2}>{t('aud.chapterOf', { i: st.index + 1, n: st.count })} · {t('aud.left', { t: fmtLong(st.left) })}</Txt>
                <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(st.pct * 100) }}
                  style={{ height: 4, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}>
                  <View style={{ width: `${Math.round(st.pct * 100)}%`, height: 4, backgroundColor: colors.gold }} />
                </View>
                <Button label={t('aud.resume')} onPress={() => { void resume(book); }} />
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {d.data && d.data.categories.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label={t('aud.all')} active={cat === ''} onPress={() => setCat('')} />
          {d.data.categories.map((c) => <Chip key={c} label={c} active={cat === c} onPress={() => setCat(c)} />)}
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top', 'bottom']}>
      <ScreenHeader title={t('aud.title')} />
      {d.loading && !d.data ? <Loading /> : !d.data ? <ErrorBox onRetry={d.reload} /> : (
        <FlatList
          data={d.data.items}
          keyExtractor={(i) => i.id}
          ListHeaderComponent={header}
          ListEmptyComponent={<Txt color={colors.muted}>{t('aud.empty')}</Txt>}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}
          onRefresh={d.reload}
          refreshing={false}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="link" accessibilityLabel={item.title} onPress={() => router.push({ pathname: '/audyn/[id]', params: { id: item.id } })}
              style={({ pressed }) => ({ flexDirection: 'row', gap: 14, padding: 12, borderRadius: radius.card, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderSoft, opacity: pressed ? 0.85 : 1 })}>
              <Cover url={item.coverUrl} size={84} />
              <View style={{ flex: 1, gap: 4, justifyContent: 'center' }}>
                <Txt weight="extrabold" size={16} numberOfLines={2}>{item.title}</Txt>
                {item.narrator || item.author ? <Txt size={13} color={colors.text2} numberOfLines={1}>{item.narrator ? t('aud.by', { name: item.narrator }) : item.author}</Txt> : null}
                <Txt size={12} color={colors.muted}>
                  {item.chapters === 1 ? t('aud.chapter1') : t('aud.chapters', { n: item.chapters })} · {fmtLong(item.durationSeconds)}
                </Txt>
                <Txt size={12} color={item.full ? colors.goldLight : colors.muted}>{item.full ? t('aud.listen') : t('aud.free')}</Txt>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
