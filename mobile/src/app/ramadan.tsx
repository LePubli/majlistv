// Étape M4 — Circuit de Ramadan dans l'application (comme /ramadan du site, étapes 45F et 45G) : actions des 30 jours
// (saisies et validées dans Admin → Ramadan), cases à cocher, tarawih de la nuit (rakaat, lieu), rappel quotidien, bilan.
// Gratuit pour tout membre connecté ; le visiteur consulte le programme. Hors Ramadan : le programme se consulte, les cases
// s'ouvrent le 1er Ramadan. ?bilan=1 : ouvre l'écran sur le bilan.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { SITE_URL } from '@/lib/config';
import { ApiError } from '@/lib/api';
import {
  canMark, clampRakaat, dayFull, hasItems, itemLink, itemsOf, marksOf, startDay, statusLine,
  type RamadanItem, type RamadanResponse,
} from '@/lib/ramadan';
import { colors, radius } from '@/lib/theme';
import { Button, Chip, ErrorBox, Loading, Panel, ScreenHeader, Txt, screenStyle } from '@/components/ui';
import { RamadanBilan } from '@/components/RamadanBilan';

export default function RamadanScreen() {
  const { api, user, t, locale, feat, dirStyle } = useSession();
  const params = useLocalSearchParams<{ bilan?: string }>();
  const [d, setD] = useState<RamadanResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const scroll = useRef<{ scrollTo: (o: { y: number; animated?: boolean }) => void } | null>(null);
  const bilanY = useRef(0);

  const load = useCallback(async () => {
    try {
      const r = await api.get<RamadanResponse>('/ramadan', { lang: locale });
      setD(r); setFailed(false); setSel((s) => s ?? startDay(r.status));
    } catch { setFailed(true); }
  }, [api, locale]);
  useEffect(() => { void load(); }, [load, user?.id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function put(path: string, body: unknown) {
    setErr('');
    try { await api.put(path, body); } catch (e) { setErr(e instanceof ApiError ? e.message : t('errGeneric')); }
    await load();
  }
  // Coche immédiate à l'écran, puis enregistrement (annulée par le rechargement si le serveur refuse).
  function mark(day: number, itemId: number, done: boolean) {
    setD((x) => {
      if (!x?.me) return x;
      const cur = x.me.marks[String(day)] || [];
      return { ...x, me: { ...x.me, marks: { ...x.me.marks, [String(day)]: done ? [...cur, itemId] : cur.filter((i) => i !== itemId) } } };
    });
    void put('/ramadan/mark', { day, itemId, done });
  }

  const shell = (body: React.ReactNode) => (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top', 'bottom']}>
      <ScreenHeader title={t('rzTitle')} />
      {body}
    </SafeAreaView>
  );
  if (failed && !d) return shell(<ErrorBox onRetry={() => { void load(); }} />);
  if (!d || sel === null) return shell(<Loading />);

  const st = d.status;
  const me = d.me;
  const day = sel;
  const can = canMark(d, day);
  const tw = me?.tarawih?.[String(day)];
  const items = itemsOf(d, day);
  const mine = marksOf(d, day);

  return shell(
    <ScrollView ref={scroll as never} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}>
      <View style={{ gap: 6 }}>
        <Txt size={14} color={colors.text2}>{t('rzIntro')}</Txt>
        {statusLine(st, t, locale) ? <Txt weight="bold" size={15} color={colors.goldLight}>{statusLine(st, t, locale)}</Txt> : null}
      </View>

      {!user ? (
        <Panel style={{ gap: 12, borderColor: colors.goldLine }}>
          <Txt weight="bold">{t('ivTitle')}</Txt>
          <Txt size={14} color={colors.text2}>{t('ivRamadan')}</Txt>
          <Button label={t('rzLogin')} onPress={() => router.push({ pathname: '/login', params: { mode: 'register' } })} />
        </Panel>
      ) : (
        <View onLayout={(e) => {
          bilanY.current = e.nativeEvent.layout.y;
          if (params.bilan === '1') setTimeout(() => scroll.current?.scrollTo({ y: bilanY.current, animated: true }), 150);
        }}>
          <RamadanBilan ended={!st.active} />
        </View>
      )}

      {err ? <Txt color={colors.danger} accessibilityRole="alert">{err}</Txt> : null}

      {!hasItems(d) ? (
        <Panel style={{ gap: 10 }}>
          <Txt weight="bold">{t('rzSoon')}</Txt>
          <Txt size={14} color={colors.text2}>{t('rzSoonTx')}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {feat('quranplan') ? <Button label={t('esReadQuran')} variant="dark" onPress={() => router.push('/quran')} /> : null}
            {feat('athkar') ? <Button label={t('obAthkar')} variant="dark" onPress={() => router.push('/athkar')} /> : null}
          </View>
        </Panel>
      ) : (
        <>
          {/* Les 30 jours */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} accessibilityLabel={t('rzDays')}>
            {d.days.map((x) => {
              const on = sel === x.day;
              const today = st.active && x.day === st.day;
              const full = dayFull(d, x.day);
              const showCount = me && st.active && st.day && x.day <= st.day;
              return (
                <Pressable key={x.day} accessibilityRole="button" accessibilityState={{ selected: on }}
                  accessibilityLabel={`${t('rzDay', { n: x.day })}${today ? ` · ${t('rzToday')}` : ''}${showCount ? ` · ${marksOf(d, x.day).length}/${itemsOf(d, x.day).length}` : ''}`}
                  onPress={() => setSel(x.day)}
                  style={{
                    width: 52, minHeight: 56, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', gap: 2,
                    backgroundColor: on ? colors.gold : full ? colors.goldTint : colors.panel, borderWidth: today ? 2 : 1, borderColor: today ? colors.gold : full ? colors.ok : colors.borderSoft,
                  }}>
                  <Txt weight="extrabold" size={16} color={on ? colors.onGold : colors.text} style={{ writingDirection: 'ltr' }}>{x.day}</Txt>
                  {showCount ? <Txt size={11} color={on ? colors.onGold : colors.muted} style={{ writingDirection: 'ltr' }}>{marksOf(d, x.day).length}/{itemsOf(d, x.day).length}</Txt> : null}
                </Pressable>
              );
            })}
          </ScrollView>

          <Panel style={{ gap: 12 }}>
            <Txt weight="extrabold" size={18} accessibilityRole="header">{t('rzDay', { n: day })}{st.active && day === st.day ? ` · ${t('rzToday')}` : ''}</Txt>
            {items.length === 0 ? <Txt color={colors.muted}>{t('rzNoItem')}</Txt> : items.map((i) => (
              <ItemRow key={i.id} it={i} done={mine.includes(i.id)} can={can} onToggle={(v) => mark(day, i.id, v)} />
            ))}

            {me && can ? (
              <View style={{ gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.borderSoft }}>
                <CheckRow label={t('rzTarawih', { n: day })} on={Boolean(tw)} onPress={() => { void put('/ramadan/tarawih', { day, done: !tw }); }} />
                {tw ? (
                  <View style={{ gap: 10 }}>
                    <Txt size={13} color={colors.muted}>{t('rzRakaat')}</Txt>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Step label="−" onPress={() => { void put('/ramadan/tarawih', { day, done: true, rakaat: clampRakaat((tw.rakaat ?? 10) - 2), place: tw.place }); }} />
                      <Txt weight="extrabold" size={20} style={{ minWidth: 40, textAlign: 'center', writingDirection: 'ltr' }}>{tw.rakaat ?? '—'}</Txt>
                      <Step label="+" onPress={() => { void put('/ramadan/tarawih', { day, done: true, rakaat: clampRakaat((tw.rakaat ?? 6) + 2), place: tw.place }); }} />
                      {tw.rakaat ? <Chip label="—" onPress={() => { void put('/ramadan/tarawih', { day, done: true, rakaat: null, place: tw.place }); }} /> : null}
                    </View>
                    <Txt size={13} color={colors.muted}>{t('rzPlace')}</Txt>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      <Chip label="—" active={!tw.place} onPress={() => { void put('/ramadan/tarawih', { day, done: true, rakaat: tw.rakaat, place: null }); }} />
                      <Chip label={t('rzMosque')} active={tw.place === 'mosque'} onPress={() => { void put('/ramadan/tarawih', { day, done: true, rakaat: tw.rakaat, place: 'mosque' }); }} />
                      <Chip label={t('rzHome')} active={tw.place === 'home'} onPress={() => { void put('/ramadan/tarawih', { day, done: true, rakaat: tw.rakaat, place: 'home' }); }} />
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
            {me && !st.active ? <Txt size={13} color={colors.muted}>{t('rzLater')}</Txt> : null}
          </Panel>

          {me ? (
            <View style={{ gap: 8 }}>
              <Txt weight="bold" size={13} color={colors.muted}>{t('atRemind')}</Txt>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                <Chip label={t('atNoRemind')} active={me.remindHour === null} onPress={() => { void put('/ramadan/prefs', { remindHour: null }); }} />
                {Array.from({ length: 24 }, (_, h) => (
                  <Chip key={h} label={`${String(h).padStart(2, '0')}:00`} active={me.remindHour === h} onPress={() => { void put('/ramadan/prefs', { remindHour: h }); }} />
                ))}
              </ScrollView>
            </View>
          ) : null}
        </>
      )}
      <Txt size={12} color={colors.muted}>{t('rzNote')}</Txt>
    </ScrollView>,
  );
}

function ItemRow({ it, done, can, onToggle }: { it: RamadanItem; done: boolean; can: boolean; onToggle: (v: boolean) => void }) {
  const { t } = useSession();
  const link = itemLink(it.link);
  const open = () => {
    if (!link) return;
    if ('app' in link) router.push(link.app as never); else void Linking.openURL(SITE_URL + link.web).catch(() => {});
  };
  return (
    <View style={{ gap: 6, padding: 12, borderRadius: radius.card, backgroundColor: colors.panel2, borderWidth: 1, borderColor: done ? colors.ok : colors.borderSoft }}>
      <CheckRow label={it.title} on={done} disabled={!can} onPress={() => onToggle(!done)} />
      {it.text ? <Txt size={14} color={colors.text2}>{it.text}</Txt> : null}
      {it.day === 0 || it.reference || link ? (
        <Txt size={12} color={colors.muted}>
          {it.day === 0 ? `${t('rzEveryDay')}${it.reference || link ? ' · ' : ''}` : ''}
          {it.reference ? `${t('atRef')} : ${it.reference}` : ''}
          {link ? <Txt size={12} weight="bold" color={colors.goldLight} onPress={open}>{it.reference ? ' · ' : ''}{t('rzOpen')}</Txt> : null}
        </Txt>
      ) : null}
    </View>
  );
}

function CheckRow({ label, on, onPress, disabled }: { label: string; on: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: !!disabled }} accessibilityLabel={label} disabled={disabled} onPress={onPress}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: disabled && !on ? 0.75 : 1 }}>
      <View style={{ width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: on ? colors.ok : disabled ? colors.borderStrong : colors.gold, backgroundColor: on ? colors.ok : 'transparent' }}>
        {on ? <Feather name="check" size={16} color={colors.onGold} /> : null}
      </View>
      <Txt weight="bold" size={15} style={{ flex: 1 }}>{label}</Txt>
    </Pressable>
  );
}

function Step({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.goldLine }}>
      <Txt weight="extrabold" size={20} color={colors.goldLight}>{label}</Txt>
    </Pressable>
  );
}
