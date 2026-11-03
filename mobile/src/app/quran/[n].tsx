// Étape M2 — Une sourate, verset par verset (comme /coran/<n> du site) : texte arabe (Hafs), traduction, phonétique, notes,
// tafsir, récitation verset par verset (lue directement chez la source, enchaînement possible), mot à mot (sens du mot touché)
// et couleurs du tajwid. Réglages gardés sur le téléphone. ?aya=5 : ouvre la sourate sur le verset 5.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useEventListener } from 'expo';
import { useVideoPlayer } from 'expo-video';
import * as SecureStore from 'expo-secure-store';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import {
  ARABIC_SIZES, DEFAULT_PREFS, nextAya, paint, readPrefs, reciterUrl, suraNum, suraQuery, tajColor, tajLegend, tokens, wordMode,
  type QuranPrefs, type Reciter, type ResourceMeta, type SuraData, type Verse,
} from '@/lib/quran';
import { colors, radius } from '@/lib/theme';
import { Button, Chip, ErrorBox, Loading, ScreenHeader, Txt, screenStyle } from '@/components/ui';

const PREFS_KEY = 'mejliss.quranPrefs';
const AR_FONT = 'Amiri_400Regular';

export default function SuraScreen() {
  const params = useLocalSearchParams<{ n?: string; aya?: string }>();
  const num = suraNum(params.n);
  const { api, t, locale, dirStyle } = useSession();
  const [prefs, setPrefs] = useState<QuranPrefs>(DEFAULT_PREFS);
  const [prefsReady, setPrefsReady] = useState(false);
  const [d, setD] = useState<SuraData | null>(null);
  const [missing, setMissing] = useState(false);
  const [reciters, setReciters] = useState<Reciter[]>([]);
  const [tafsir, setTafsir] = useState<{ slug: string; items: Map<number, string> } | null>(null);
  const [showOpts, setShowOpts] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const [audioErr, setAudioErr] = useState(false);
  const listRef = useRef<FlatList<Verse>>(null);
  const jumped = useRef(false);

  // Réglages enregistrés (une fois).
  useEffect(() => {
    SecureStore.getItemAsync(PREFS_KEY).then((raw) => setPrefs(readPrefs(raw))).catch(() => {}).finally(() => setPrefsReady(true));
  }, []);
  const set = (patch: Partial<QuranPrefs>) => setPrefs((p) => {
    const x = { ...p, ...patch };
    void SecureStore.setItemAsync(PREFS_KEY, JSON.stringify(x)).catch(() => {});
    return x;
  });

  // Sourate (relue quand un réglage qui change la réponse bouge).
  useEffect(() => {
    if (!num) { setMissing(true); return undefined; }
    if (!prefsReady) return undefined;
    let dead = false;
    api.get<SuraData>(`/quran/suras/${num}`, suraQuery(locale, prefs), false)
      .then((r) => { if (!dead) { setD(r); setMissing(false); } })
      .catch(() => { if (!dead) setMissing(true); });
    return () => { dead = true; };
  }, [api, num, locale, prefsReady, prefs.translation, prefs.ph, prefs.wbw, prefs.taj]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { api.get<Reciter[]>('/quran/reciters', undefined, false).then(setReciters).catch(() => setReciters([])); }, [api]);

  useEffect(() => {
    if (!prefs.tafsir || !d || !num) { setTafsir(null); return undefined; }
    let dead = false;
    api.get<{ items: { aya: number; text: string }[] }>(`/quran/tafsir/${prefs.tafsir}/${num}`, undefined, false)
      .then((r) => { if (!dead) setTafsir({ slug: prefs.tafsir, items: new Map(r.items.map((i) => [i.aya, i.text])) }); })
      .catch(() => { if (!dead) setTafsir(null); });
    return () => { dead = true; };
  }, [api, prefs.tafsir, num, d?.sura.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // Récitation : lecteur audio sans image (expo-video lit aussi les MP3), fichier lu directement chez la source.
  const reciter = reciters.find((x) => x.slug === prefs.reciter) || reciters[0] || null;
  const player = useVideoPlayer(null, (p) => { p.staysActiveInBackground = true; });
  const playingRef = useRef<number | null>(null);
  const play = useCallback(async (aya: number) => {
    const url = reciter && num ? reciterUrl(reciter.urlTemplate, num, aya) : null;
    if (!url) return;
    setAudioErr(false); setPlaying(aya); playingRef.current = aya;
    try { await player.replaceAsync({ uri: url }); player.play(); } catch { setAudioErr(true); setPlaying(null); playingRef.current = null; }
    const i = d?.verses.findIndex((v) => v.aya === aya) ?? -1;
    if (i >= 0) listRef.current?.scrollToIndex({ index: i, viewPosition: 0.3, animated: true });
  }, [reciter, num, player, d]);
  const stop = useCallback(() => { try { player.pause(); } catch { /* lecteur libéré */ } setPlaying(null); playingRef.current = null; }, [player]);
  useEventListener(player, 'playToEnd', () => {
    const cur = playingRef.current;
    const next = cur && d ? nextAya(d.verses, cur, prefs.chain) : null;
    if (next) void play(next); else { setPlaying(null); playingRef.current = null; }
  });
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error' && playingRef.current) { setAudioErr(true); setPlaying(null); playingRef.current = null; }
  });
  useEffect(() => { stop(); }, [num, prefs.reciter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Aller au verset demandé (?aya=…) une fois la sourate affichée.
  useEffect(() => {
    const aya = Number(params.aya);
    if (!d || jumped.current || !(aya > 1)) return;
    const i = d.verses.findIndex((v) => v.aya === aya);
    if (i < 0) return;
    jumped.current = true;
    setTimeout(() => listRef.current?.scrollToIndex({ index: i, viewPosition: 0.2, animated: false }), 250);
  }, [d, params.aya]);

  if (missing) {
    return (
      <SafeAreaView style={[screenStyle, dirStyle]} edges={['top', 'bottom']}>
        <ScreenHeader title={t('qrTitle')} />
        <ErrorBox message={t('qrNotFound')} />
      </SafeAreaView>
    );
  }
  if (!d || !num) {
    return <SafeAreaView style={[screenStyle, dirStyle]} edges={['top', 'bottom']}><ScreenHeader title={t('qrTitle')} /><Loading /></SafeAreaView>;
  }

  const tafsirMeta = tafsir ? d.tafsirs.find((x) => x.slug === tafsir.slug) : undefined;
  const credits: ResourceMeta[] = [d.text, d.translation, d.transliteration, tafsirMeta].filter(Boolean) as ResourceMeta[];
  if (reciter) credits.push({ slug: 'rc', lang: 'ar', name: reciter.name, credit: reciter.credit, license: reciter.license, sourceUrl: reciter.sourceUrl });
  if (prefs.wbw && d.wordsMeta) credits.push(d.wordsMeta);
  if (prefs.taj && d.tajweedMeta) credits.push(d.tajweedMeta);

  const head = (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Txt size={12} color={colors.muted}>{t('qrSura')} {d.sura.n}</Txt>
        <Text style={{ fontFamily: 'Amiri_700Bold', fontSize: 34, lineHeight: 60, color: colors.goldLight, writingDirection: 'rtl' }}>{d.sura.ar}</Text>
        <Txt weight="bold" size={16}>{d.sura.en}</Txt>
      </View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showOpts }} onPress={() => setShowOpts(!showOpts)}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}>
        <Feather name="sliders" size={17} color={colors.goldLight} />
        <Txt weight="bold" size={14} color={colors.goldLight}>{t('qrOptions')}</Txt>
      </Pressable>
      {showOpts ? <Options d={d} prefs={prefs} set={set} reciters={reciters} reciter={reciter} /> : null}
      {audioErr ? <Txt color={colors.danger} accessibilityRole="alert">{t('qrAudioErr')}</Txt> : null}
      {prefs.taj && d.tajweed ? (
        <View accessibilityLabel={t('qrLegend')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {tajLegend(d.tajweed, locale).map((x) => (
            <View key={x.color} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: x.color }} />
              <Txt size={12} color={colors.text2}>{x.label}</Txt>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  const foot = (
    <View style={{ gap: 14, paddingTop: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
        {num > 1 ? <Button variant="dark" label={t('qrPrev')} onPress={() => router.replace({ pathname: '/quran/[n]', params: { n: String(num - 1) } })} style={{ flex: 1 }} /> : <View style={{ flex: 1 }} />}
        {num < 114 ? <Button variant="dark" label={t('qrNext')} onPress={() => router.replace({ pathname: '/quran/[n]', params: { n: String(num + 1) } })} style={{ flex: 1 }} /> : <View style={{ flex: 1 }} />}
      </View>
      <View style={{ gap: 4 }}>
        <Txt weight="bold" size={12} color={colors.muted}>{t('qrSources')}</Txt>
        {credits.map((c) => (
          <Txt key={c.slug + c.name} size={12} color={colors.muted}>
            {c.name}{c.author ? ` — ${c.author}` : ''}{c.credit ? ` · ${c.credit}` : ''}{c.license ? ` · ${c.license}` : ''}
            {c.sourceUrl && /^https?:\/\//i.test(c.sourceUrl) ? <Txt size={12} color={colors.goldLight} onPress={() => { void Linking.openURL(c.sourceUrl as string); }}> · {t('qrSource')}</Txt> : null}
          </Txt>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top', 'bottom']}>
      <ScreenHeader title={`${d.sura.n}. ${d.sura.en}`} />
      <FlatList
        ref={listRef}
        data={d.verses}
        keyExtractor={(v) => String(v.aya)}
        ListHeaderComponent={head}
        ListFooterComponent={foot}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
          setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.2, animated: false }), 200);
        }}
        renderItem={({ item }) => (
          <VerseCard v={item} d={d} prefs={prefs} playing={playing === item.aya} canPlay={!!reciter}
            onPlay={() => (playing === item.aya ? stop() : void play(item.aya))} tafsirText={tafsir?.items.get(item.aya)} tafsirLang={tafsirMeta?.lang} />
        )}
      />
    </SafeAreaView>
  );
}

/** Options de lecture : traduction, phonétique, tafsir, récitateur, enchaînement, mot à mot, tajwid, taille. */
function Options({ d, prefs, set, reciters, reciter }: { d: SuraData; prefs: QuranPrefs; set: (p: Partial<QuranPrefs>) => void; reciters: Reciter[]; reciter: Reciter | null }) {
  const { t } = useSession();
  const tr = prefs.translation || d.translation?.slug || 'none';
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <View style={{ gap: 6 }}>
      <Txt weight="bold" size={12} color={colors.muted}>{label}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{children}</View>
    </View>
  );
  const toggle = (label: string, on: boolean, k: 'ph' | 'chain' | 'wbw' | 'taj') => <Chip label={`${on ? '✓ ' : ''}${label}`} active={on} onPress={() => set({ [k]: !on } as Partial<QuranPrefs>)} />;
  return (
    <View style={{ gap: 12, padding: 14, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }}>
      {d.translations.length > 0 ? (
        <Row label={t('qrTranslation')}>
          {d.translations.map((x) => <Chip key={x.slug} label={`${x.name} (${x.lang})`} active={tr === x.slug} onPress={() => set({ translation: x.slug })} />)}
          <Chip label={t('qrNone')} active={tr === 'none'} onPress={() => set({ translation: 'none' })} />
        </Row>
      ) : null}
      {d.tafsirs.length > 0 ? (
        <Row label={t('qrTafsir')}>
          <Chip label={t('qrNone')} active={!prefs.tafsir} onPress={() => set({ tafsir: '' })} />
          {d.tafsirs.map((x) => <Chip key={x.slug} label={`${x.name} (${x.lang})`} active={prefs.tafsir === x.slug} onPress={() => set({ tafsir: x.slug })} />)}
        </Row>
      ) : null}
      {reciters.length > 0 ? (
        <Row label={t('qrReciter')}>
          {reciters.map((x) => <Chip key={x.slug} label={x.name} active={reciter?.slug === x.slug} onPress={() => set({ reciter: x.slug })} />)}
        </Row>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {d.transliterations.length > 0 ? toggle(t('qrPhonetic'), prefs.ph, 'ph') : null}
        {reciters.length > 0 ? toggle(t('qrChain'), prefs.chain, 'chain') : null}
        {d.wordsMeta ? toggle(t('qrWbw'), prefs.wbw, 'wbw') : null}
        {d.tajweedMeta ? toggle(t('qrTajweed'), prefs.taj, 'taj') : null}
      </View>
      <Row label={t('qrSize')}>
        {([1, 2, 3, 4] as const).map((s) => <Chip key={s} label={'A'.padEnd(s, '+')} active={prefs.size === s} onPress={() => set({ size: s })} />)}
      </Row>
    </View>
  );
}

function VerseCard({ v, d, prefs, playing, canPlay, onPlay, tafsirText, tafsirLang }: {
  v: Verse; d: SuraData; prefs: QuranPrefs; playing: boolean; canPlay: boolean; onPlay: () => void; tafsirText?: string; tafsirLang?: string;
}) {
  const { t } = useSession();
  const [showTf, setShowTf] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const size = ARABIC_SIZES[prefs.size];
  const arStyle = { fontFamily: AR_FONT, fontSize: size, lineHeight: Math.round(size * 2), color: colors.text, textAlign: 'right' as const, writingDirection: 'rtl' as const };
  const cps = [...v.ar];
  const marks = prefs.taj ? d.tajweed?.[String(v.aya)] : null;
  const words = prefs.wbw ? d.words?.[String(v.aya)] : null;
  const wm = words && wordMode(v.ar, words);
  const trRtl = d.translation?.lang === 'ar';
  const colored = (from: number, to: number) => paint(cps, marks, from, to).map((p, i) => (p.rule ? <Text key={i} style={{ color: tajColor(p.rule) }}>{p.text}</Text> : p.text));

  return (
    <View style={{ gap: 10, padding: 14, borderRadius: radius.panel, backgroundColor: playing ? colors.goldTint : colors.panel, borderWidth: 1, borderColor: playing ? colors.gold : colors.borderSoft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View accessibilityLabel={`${t('qrVerse')} ${v.aya}`} style={{ minWidth: 34, height: 34, paddingHorizontal: 6, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldLine }}>
          <Txt weight="bold" size={13} color={colors.goldLight} style={{ writingDirection: 'ltr' }}>{v.aya}</Txt>
        </View>
        {canPlay ? (
          <Pressable accessibilityRole="button" accessibilityState={{ selected: playing }} accessibilityLabel={`${playing ? t('qrStop') : t('qrListen')} — ${t('qrVerse')} ${v.aya}`} onPress={onPlay}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: playing ? colors.gold : colors.panel2, borderWidth: 1, borderColor: colors.goldLine }}>
            <Feather name={playing ? 'square' : 'play'} size={18} color={playing ? colors.onGold : colors.goldLight} />
          </Pressable>
        ) : null}
      </View>

      {wm && words ? (
        <View style={{ direction: 'rtl', flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {tokens(cps).map(([a, b], i) => (
            <Pressable key={a} accessibilityRole="button" accessibilityState={{ selected: sel === i }} accessibilityLabel={`${cps.slice(a, b).join('')} — ${words[i]}`}
              onPress={() => setSel(sel === i ? null : i)}
              style={{ paddingHorizontal: 4, borderRadius: 8, backgroundColor: sel === i ? colors.goldTint : 'transparent' }}>
              <Text style={arStyle}>{colored(a, b)}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={arStyle} accessibilityLanguage="ar" onPress={canPlay ? onPlay : undefined}>{marks ? colored(0, cps.length) : v.ar}</Text>
      )}
      {wm && words && sel !== null ? (
        <Txt size={14} color={colors.goldLight} accessibilityLiveRegion="polite">{cps.slice(...tokens(cps)[sel]).join('')} — {words[sel]}</Txt>
      ) : null}

      {v.ph ? <Txt size={14} color={colors.muted} style={{ fontStyle: 'italic', writingDirection: 'ltr', textAlign: 'left' }}>{v.ph}</Txt> : null}
      {v.tr ? <Txt size={15} color={colors.text2} style={{ writingDirection: trRtl ? 'rtl' : 'ltr', textAlign: trRtl ? 'right' : 'left' }}>{v.tr}</Txt> : null}

      {v.tn ? (
        <>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showNotes }} onPress={() => setShowNotes(!showNotes)} style={{ minHeight: 36, justifyContent: 'center' }}>
            <Txt weight="bold" size={13} color={colors.goldLight}>{t('qrNotes')}</Txt>
          </Pressable>
          {showNotes ? <Txt size={13} color={colors.text2} style={{ writingDirection: trRtl ? 'rtl' : 'ltr' }}>{v.tn}</Txt> : null}
        </>
      ) : null}
      {tafsirText ? (
        <>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showTf }} onPress={() => setShowTf(!showTf)} style={{ minHeight: 36, justifyContent: 'center' }}>
            <Txt weight="bold" size={13} color={colors.goldLight}>{showTf ? t('qrHideTafsir') : t('qrShowTafsir')}</Txt>
          </Pressable>
          {showTf ? <Txt size={14} color={colors.text2} style={{ writingDirection: tafsirLang === 'ar' ? 'rtl' : 'ltr', textAlign: tafsirLang === 'ar' ? 'right' : 'left' }}>{tafsirText}</Txt> : null}
        </>
      ) : null}
    </View>
  );
}
