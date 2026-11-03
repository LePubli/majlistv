// Étape M2 — « Lire le Coran en 30 jours » dans l'application (comme le site, étape 45E) : 1 juz par jour, case « Lu »,
// progression, rappel quotidien facultatif (heure de Paris, notification du serveur), fin de programme (recommencer, partager).
// Gratuit pour tout membre connecté ; le visiteur voit l'explication et un bouton pour se connecter.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { SITE_URL } from '@/lib/config';
import { ApiError } from '@/lib/api';
import { juzRange, planPhase, type Juz, type QuranPlan as Plan } from '@/lib/quran';
import { colors, radius } from '@/lib/theme';
import { Button, Chip, Txt } from './ui';

export function QuranPlan() {
  const { api, user, t, locale } = useSession();
  const [juzs, setJuzs] = useState<Juz[] | null>(null);
  const [plan, setPlan] = useState<Plan | undefined>(undefined);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState(false);

  useEffect(() => { api.get<Juz[]>('/quran/juzs', undefined, false).then(setJuzs).catch(() => setJuzs(null)); }, [api]);
  const load = useCallback(() => {
    if (!user) { setPlan(undefined); return; }
    api.get<{ plan: Plan }>('/quran/plan').then((r) => setPlan(r.plan)).catch(() => setPlan(null));
  }, [api, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  async function act(method: 'post' | 'put' | 'del', path: string, body?: unknown) {
    setErr(''); setBusy(true);
    try {
      const r = method === 'post' ? await api.post<{ plan: Plan }>(path, body ?? {}) : method === 'put' ? await api.put<{ plan: Plan }>(path, body) : await api.del<{ plan: Plan }>(path);
      setPlan(r.plan);
    } catch (e) { setErr(e instanceof ApiError ? e.message : t('errGeneric')); } finally { setBusy(false); }
  }
  const ask = (msg: string, go: () => void) => Alert.alert(t('khTitle'), msg, [{ text: t('cancelBtn'), style: 'cancel' }, { text: 'OK', onPress: go }]);
  const restart = () => ask(t('khRestartAsk'), () => { void act('post', '/quran/plan/start'); });
  async function share() {
    try { await Share.share({ message: `${t('khShareTx')} ${SITE_URL}/coran` }); setShared(true); } catch { /* partage annulé */ }
  }
  const openAt = (j: Juz) => router.push({ pathname: '/quran/[n]', params: { n: String(j.start.sura), aya: String(j.start.aya) } });

  if (!juzs) return null;
  const box = { padding: 16, gap: 12, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.goldLine } as const;

  if (!user) {
    return (
      <View style={box}>
        <Txt weight="extrabold" size={18} accessibilityRole="header">{t('khTitle')}</Txt>
        <Txt size={14} color={colors.text2}>{t('khIntro')}</Txt>
        <Button label={t('khLogin')} onPress={() => router.push('/login')} />
      </View>
    );
  }
  if (plan === undefined) return null;
  if (!plan) {
    return (
      <View style={box}>
        <Txt weight="extrabold" size={18} accessibilityRole="header">{t('khTitle')}</Txt>
        <Txt size={14} color={colors.text2}>{t('khIntro')}</Txt>
        {err ? <Txt color={colors.danger} accessibilityRole="alert">{err}</Txt> : null}
        <Button label={t('khStart')} loading={busy} onPress={() => { void act('post', '/quran/plan/start'); }} />
      </View>
    );
  }

  const read = new Set(plan.reads);
  const today = plan.todayJuz ? juzs[plan.todayJuz - 1] : null;
  const phase = planPhase(plan);
  const pct = Math.round((plan.reads.length / 30) * 100);
  const toggle = (n: number, v: boolean) => { void act('put', `/quran/plan/juz/${n}`, { read: v }); };

  return (
    <View style={box} accessibilityLabel={t('khTitle')}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <Txt weight="extrabold" size={18} accessibilityRole="header">{t('khTitle')}</Txt>
        <Txt size={13} color={colors.muted}>{phase === 'day' ? t('khDay', { n: plan.day }) : phase === 'over' ? t('khOver') : t('khSoon')}</Txt>
      </View>
      <View accessibilityRole="progressbar" accessibilityLabel={t('khProgress')} accessibilityValue={{ min: 0, max: 30, now: plan.reads.length }}
        style={{ height: 8, borderRadius: 4, backgroundColor: colors.panel2, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: colors.gold }} />
      </View>
      <Txt size={13} color={colors.muted}>{t('khRead', { n: plan.reads.length })}{plan.completed > 0 ? ` · ${t('khCompleted', { n: plan.completed })}` : ''}</Txt>

      {plan.finished ? (
        <View accessibilityRole="summary" style={{ gap: 8, padding: 12, borderRadius: radius.card, backgroundColor: colors.goldTint }}>
          <Txt weight="bold" color={colors.ok}>✓ {t('khFinished')}</Txt>
          <Txt size={14} color={colors.text2}>{t('khEndTx')}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button label={t('khRestart')} loading={busy} onPress={() => { void act('post', '/quran/plan/start'); }} />
            <Button label={shared ? `✓ ${t('khShared')}` : t('khShare')} variant="dark" onPress={() => { void share(); }} />
          </View>
        </View>
      ) : null}

      {!plan.finished && phase === 'over' ? (
        <View style={{ gap: 8, padding: 12, borderRadius: radius.card, backgroundColor: colors.panel2 }}>
          <Txt weight="bold">{t('khOverTx', { n: plan.reads.length })}</Txt>
          <Txt size={14} color={colors.text2}>{t('khOverHelp')}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button label={t('khContinue')} onPress={() => setOpen(true)} />
            <Button label={t('khRestart')} variant="dark" onPress={restart} />
          </View>
        </View>
      ) : null}

      {today ? (
        <View style={{ gap: 10, padding: 12, borderRadius: radius.card, backgroundColor: colors.panel2, borderWidth: 1, borderColor: read.has(today.n) ? colors.ok : colors.borderSoft }}>
          <Txt weight="bold" size={16}>{t('khToday', { n: today.n })}</Txt>
          <Txt size={13} color={colors.muted}>{juzRange(today, locale)}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Button label={t('khReadNow')} onPress={() => openAt(today)} style={{ flex: 1 }} />
            <Check label={t('khMark')} on={read.has(today.n)} onPress={() => toggle(today.n, !read.has(today.n))} />
          </View>
        </View>
      ) : null}

      {err ? <Txt color={colors.danger} accessibilityRole="alert">{err}</Txt> : null}

      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ minHeight: 40, justifyContent: 'center' }}>
        <Txt weight="bold" size={14} color={colors.goldLight}>{open ? t('khHideAll') : t('khShowAll')}</Txt>
      </Pressable>

      {open ? (
        <View style={{ gap: 8 }}>
          {juzs.map((j) => (
            <View key={j.n} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.card, backgroundColor: colors.panel2, borderWidth: 1, borderColor: plan.todayJuz === j.n ? colors.gold : colors.borderSoft }}>
              <Check label={t('khJuz', { n: j.n })} on={read.has(j.n)} onPress={() => toggle(j.n, !read.has(j.n))} />
              <Pressable accessibilityRole="link" accessibilityLabel={`${t('khReadNow')} — ${juzRange(j, locale)}`} onPress={() => openAt(j)} style={{ flex: 1, minHeight: 40, justifyContent: 'center' }}>
                <Txt size={13} color={colors.text2} numberOfLines={2}>{juzRange(j, locale)}</Txt>
              </Pressable>
            </View>
          ))}
          <Txt weight="bold" size={13} color={colors.muted}>{t('khRemind')}</Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <Chip label={t('atNoRemind')} active={plan.remindHour === null} onPress={() => { void act('put', '/quran/plan/prefs', { remindHour: null }); }} />
            {Array.from({ length: 24 }, (_, h) => (
              <Chip key={h} label={`${String(h).padStart(2, '0')}:00`} active={plan.remindHour === h} onPress={() => { void act('put', '/quran/plan/prefs', { remindHour: h }); }} />
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button label={t('khRestart')} variant="dark" onPress={restart} />
            <Button label={t('khStop')} variant="dark" onPress={() => ask(t('khStopAsk'), () => { void act('del', '/quran/plan'); })} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Case à cocher accessible (48 px de haut). */
function Check({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label} onPress={onPress}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
      <View style={{ width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: on ? colors.ok : colors.gold, backgroundColor: on ? colors.ok : 'transparent' }}>
        {on ? <Feather name="check" size={15} color={colors.onGold} /> : null}
      </View>
      <Txt weight="bold" size={14}>{label}</Txt>
    </Pressable>
  );
}
