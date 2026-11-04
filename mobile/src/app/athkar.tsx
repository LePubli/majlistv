// Étape M3 — Compteur d'athkar dans l'application (comme l'onglet « Adhkar » du site, étape 45D ; offre Apprentissage).
// Dhikr saisis et validés dans Admin → Adhkar, avec leur référence. Un toucher = +1 ; les touchers rapprochés partent ensemble.
// Compte du jour en heure de Paris ; objectif du jour, série de jours, rappel facultatif. ?cat=morning : ouvre sur un moment.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/session';
import { SITE_URL } from '@/lib/config';
import { ApiError } from '@/lib/api';
import { isLearningRequired } from '@/lib/learn';
import { addPending, applyTap, catsPresent, clampGoal, pickCat, reachesTarget, type AthkarItem, type AthkarResponse } from '@/lib/athkar';
import type { Key } from '@/lib/i18n';
import { colors, fonts, radius } from '@/lib/theme';
import { Button, Chip, ErrorBox, Loading, Panel, ScreenHeader, Txt, screenStyle } from '@/components/ui';

export default function AthkarScreen() {
  const { api, user, t, locale, feat, dirStyle } = useSession();
  const params = useLocalSearchParams<{ cat?: string }>();
  const [d, setD] = useState<AthkarResponse | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [msg, setMsg] = useState('');
  const [cat, setCat] = useState<string>(pickCat(params.cat));
  const [goal, setGoal] = useState('');
  const [justDone, setJustDone] = useState<number | null>(null);
  const pending = useRef(new Map<number, number>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const r = await api.get<AthkarResponse>('/athkar', { lang: locale });
      setD(r); setGoal(String(r.goal)); setErr(null);
    } catch (e) { setErr(e); }
  }, [api, user?.id, locale]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const c = pickCat(params.cat); if (c) setCat(c); }, [params.cat]);

  const flush = useCallback(async () => {
    timer.current = null;
    const batch = [...pending.current.entries()];
    pending.current.clear();
    for (const [id, n] of batch) {
      try { await api.post(`/athkar/${id}/tap`, { n }); } catch (e) { setMsg(e instanceof ApiError ? e.message : t('errGeneric')); break; }
    }
    await load(); // série et objectif du jour à jour
  }, [api, load, t]);
  // En quittant l'écran, les touchers pas encore envoyés partent quand même.
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void flush(); } }, [flush]);

  function tap(it: AthkarItem) {
    setD((x) => (x ? { ...x, items: applyTap(x.items, it.id) } : x));
    if (reachesTarget(it)) { setJustDone(it.id); setTimeout(() => setJustDone((v) => (v === it.id ? null : v)), 1500); }
    addPending(pending.current, it.id);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 700);
  }
  function reset(it: AthkarItem) {
    Alert.alert(t('atTab'), t('atResetAsk'), [
      { text: t('cancelBtn'), style: 'cancel' },
      { text: t('atReset'), style: 'destructive', onPress: async () => { pending.current.delete(it.id); await api.post(`/athkar/${it.id}/reset`).catch(() => {}); await load(); } },
    ]);
  }
  async function savePrefs(p: { goal: number; remindHour: number | null }) {
    setMsg('');
    try { await api.put('/athkar/prefs', p); await load(); } catch (e) { setMsg(e instanceof ApiError ? e.message : t('errGeneric')); }
  }

  const shell = (body: React.ReactNode) => (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top', 'bottom']}>
      <ScreenHeader title={t('atTab')} />
      {body}
    </SafeAreaView>
  );

  if (!user) {
    return shell(
      <View style={{ padding: 16 }}>
        <Panel style={{ gap: 12 }}>
          <Txt color={colors.text2}>{t('learn.guest')}</Txt>
          <Button label={t('account.signin')} onPress={() => router.push('/login')} />
        </Panel>
      </View>,
    );
  }
  if (isLearningRequired(err)) {
    return shell(
      <View style={{ padding: 16 }}>
        <Panel style={{ borderColor: colors.goldLine, backgroundColor: colors.goldTint, gap: 12 }}>
          <Txt weight="bold" color={colors.goldLight}>{t('learn.locked')}</Txt>
          <Button label={t('learn.openSite')} variant="dark" onPress={() => { void Linking.openURL(`${SITE_URL}/account`); }} />
        </Panel>
      </View>,
    );
  }
  if (err && !d) return shell(<ErrorBox onRetry={() => { void load(); }} />);
  if (!d) return shell(<Loading />);

  const cats = catsPresent(d.items);
  const list = d.items.filter((i) => !cat || i.category === cat);
  const hourChips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      <Chip label={t('atNoRemind')} active={d.remindHour === null} onPress={() => { void savePrefs({ goal: clampGoal(goal), remindHour: null }); }} />
      {Array.from({ length: 24 }, (_, h) => (
        <Chip key={h} label={`${String(h).padStart(2, '0')}:00`} active={d.remindHour === h} onPress={() => { void savePrefs({ goal: clampGoal(goal), remindHour: h }); }} />
      ))}
    </ScrollView>
  );

  const head = (
    <View style={{ gap: 12, paddingBottom: 6 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label={t('atToday')} value={`${d.doneToday} / ${d.goal}`} />
        <Stat label={t('atStreak')} value={t('atDays', { n: d.streak })} />
      </View>
      <Panel style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Txt size={14} color={colors.text2} style={{ flex: 1 }}>{t('atGoal')}</Txt>
          <TextInput value={goal} onChangeText={(v) => setGoal(v.replace(/[^0-9]/g, '').slice(0, 3))} keyboardType="number-pad" accessibilityLabel={t('atGoal')}
            onEndEditing={() => { const g = clampGoal(goal); setGoal(String(g)); if (g !== d.goal) void savePrefs({ goal: g, remindHour: d.remindHour }); }}
            style={{ width: 72, minHeight: 44, textAlign: 'center', borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel2, color: colors.text, fontFamily: fonts.bold, fontSize: 16 }} />
        </View>
        <Txt size={14} color={colors.text2}>{t('atRemind')}</Txt>
        {hourChips}
      </Panel>
      {msg ? <Txt color={colors.danger} accessibilityRole="alert">{msg}</Txt> : null}
      {cats.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} accessibilityLabel={t('atCats')}>
          <Chip label={t('atAll')} active={!cat} onPress={() => setCat('')} />
          {cats.map((c) => <Chip key={c} label={t(`atCat_${c}` as Key)} active={cat === c} onPress={() => setCat(c)} />)}
        </ScrollView>
      ) : null}
    </View>
  );

  return shell(
    <FlatList
      data={list}
      keyExtractor={(i) => String(i.id)}
      ListHeaderComponent={head}
      ListEmptyComponent={(
        <Panel style={{ gap: 10 }}>
          <Txt weight="bold">{t('atEmpty')}</Txt>
          <Txt size={14} color={colors.text2}>{t('atEmptyTx')}</Txt>
          {feat('quran') ? <Button label={t('esReadQuran')} variant="dark" onPress={() => router.push('/quran')} /> : null}
        </Panel>
      )}
      ListFooterComponent={<Txt size={12} color={colors.muted} style={{ paddingTop: 8 }}>{t('atNote')}</Txt>}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}
      onRefresh={() => { void load(); }}
      refreshing={false}
      renderItem={({ item }) => <Dhikr it={item} justDone={justDone === item.id} onTap={() => tap(item)} onReset={() => reset(item)} />}
    />,
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, padding: 14, gap: 4, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.goldLine }}>
      <Txt size={12} color={colors.muted}>{label}</Txt>
      <Txt weight="extrabold" size={20} color={colors.goldLight}>{value}</Txt>
    </View>
  );
}

function Dhikr({ it, justDone, onTap, onReset }: { it: AthkarItem; justDone: boolean; onTap: () => void; onReset: () => void }) {
  const { t } = useSession();
  const done = it.count >= it.target;
  return (
    <View style={{ gap: 10, padding: 14, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: done ? colors.ok : colors.borderSoft }}>
      <Text style={{ fontFamily: 'Amiri_400Regular', fontSize: 25, lineHeight: 50, color: colors.text, textAlign: 'right', writingDirection: 'rtl' }}>{it.ar}</Text>
      {it.translit ? <Txt size={14} color={colors.muted} style={{ fontStyle: 'italic', writingDirection: 'ltr', textAlign: 'left' }}>{it.translit}</Txt> : null}
      {it.tr ? <Txt size={15} color={colors.text2}>{it.tr}</Txt> : null}
      <Txt size={12} color={colors.muted}>{t('atRef')} : {it.reference}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${t('atTapLabel')} — ${it.count} / ${it.target}`} onPress={onTap}
          style={({ pressed }) => ({
            minWidth: 110, minHeight: 64, paddingHorizontal: 18, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6,
            paddingTop: 14, backgroundColor: done ? colors.goldTint : colors.gold, borderWidth: done ? 1 : 0, borderColor: colors.gold,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          })}>
          <Txt weight="extrabold" size={24} color={done ? colors.goldLight : colors.onGold} style={{ writingDirection: 'ltr' }}>{it.count}</Txt>
          <Txt weight="bold" size={14} color={done ? colors.goldLight : colors.onGold} style={{ writingDirection: 'ltr' }}>/ {it.target}</Txt>
        </Pressable>
        <Txt weight="bold" size={14} color={colors.ok} accessibilityLiveRegion="polite" style={{ flex: 1 }}>{done || justDone ? `✓ ${t('atDone')}` : ''}</Txt>
        {it.count > 0 ? (
          <Pressable accessibilityRole="button" onPress={onReset} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
            <Txt size={13} weight="bold" color={colors.muted}>{t('atReset')}</Txt>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
