// Série de jours et objectif de la semaine (Apprentissage). Sobre : un chiffre, sept pastilles, une barre. Aucun badge pour les adultes.
// Même carte que web/components/StreakCard.js ; données : GET /me/learning/streak, réglage : PUT /me/learning/goal.
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSession } from '@/lib/session';
import type { StreakResponse } from '@/lib/types';
import { colors } from '@/lib/theme';
import { Panel, Txt } from '@/components/ui';

export function StreakCard() {
  const { t, locale, api, isRTL } = useSession();
  const [s, setS] = useState<StreakResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setS(await api.get<StreakResponse>('/me/learning/streak')); } catch { setS(null); } }, [api]);
  useEffect(() => { void load(); }, [load]);
  const save = async (body: { goal?: number; show?: boolean }) => {
    setBusy(true);
    try { setS(await api.put<StreakResponse>('/me/learning/goal', body)); } catch { /* réglage non enregistré : l'affichage reste celui du serveur */ }
    setBusy(false);
  };
  if (!s) return null;
  const side = { textAlign: isRTL ? 'right' : 'left' } as const;
  if (!s.show) return <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save({ show: true })} style={{ minHeight: 40, justifyContent: 'center' }}><Txt size={13} color={colors.goldLight} style={{ textDecorationLine: 'underline', ...side }}>{t('skShow')}</Txt></Pressable>;

  const w = s.week;
  const letter = (d: string) => new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : locale, { timeZone: 'UTC', weekday: 'narrow' }).format(new Date(`${d}T12:00:00Z`));
  const pct = Math.min(100, Math.round((w.done / w.goal) * 100));
  const line = s.current === 0 ? t('skZero') : s.atRisk ? t('skRisk') : s.activeToday ? t('skDone') : '';

  return (
    <Panel>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Txt weight="extrabold" size={44} color={colors.goldLight}>{s.current}</Txt>
        <Txt weight="bold">{s.current === 1 ? t('skDay1') : t('skDayN')}</Txt>
      </View>
      <Txt size={13} color={colors.muted} style={side}>{line}{s.best > s.current ? ` ${t('skBest', { n: s.best })}` : ''}</Txt>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} accessibilityLabel={t('skWeek')}>
        {w.days.map((d) => (
          <View key={d.date} style={{ alignItems: 'center', gap: 4 }} accessibilityLabel={`${d.date}${d.active ? ' ✓' : ''}`}>
            <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 2,
              borderColor: d.active || d.today ? colors.gold : colors.border, borderStyle: d.future ? 'dashed' : 'solid', backgroundColor: d.active ? colors.gold : 'transparent', opacity: d.future ? 0.6 : 1 }}>
              {d.active ? <Txt weight="extrabold" size={15} color={colors.onGold}>✓</Txt> : null}
            </View>
            <Txt size={11} color={colors.muted}>{letter(d.date)}</Txt>
          </View>
        ))}
      </View>
      <Txt size={12} color={colors.muted} style={side}>{s.graceUsedThisWeek ? t('skRestUsed') : t('skRest')}</Txt>

      <Txt weight="bold" size={16} style={{ marginTop: 6, ...side }}>{t('skGoalTitle')}</Txt>
      <Txt style={side}><Txt weight="extrabold" size={22} color={colors.goldLight}>{w.done}</Txt> / {w.goal} {t('skGoalUnit')}</Txt>
      <View style={{ height: 8, borderRadius: 99, backgroundColor: colors.border, overflow: 'hidden' }}><View style={{ width: `${pct}%`, height: '100%', backgroundColor: colors.gold }} /></View>
      {w.reached ? <Txt size={13} color={colors.ok} style={side}>{t('skReached')}</Txt> : null}
      <Txt size={12} color={colors.muted} style={side}>{t('skGoalSet')}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup">
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <Pressable key={n} accessibilityRole="radio" accessibilityState={{ selected: n === w.goal }} disabled={busy} onPress={() => n !== w.goal && void save({ goal: n })}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: n === w.goal ? colors.gold : colors.border, backgroundColor: n === w.goal ? colors.gold : 'transparent' }}>
            <Txt weight="bold" color={n === w.goal ? colors.onGold : colors.text}>{n}</Txt>
          </Pressable>
        ))}
      </View>
      <Txt size={12} color={colors.muted} style={side}>{t('skRule')}</Txt>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save({ show: false })} style={{ minHeight: 40, justifyContent: 'center' }}>
        <Txt size={13} color={colors.goldLight} style={{ textDecorationLine: 'underline', ...side }}>{t('skHide')}</Txt>
      </Pressable>
    </Panel>
  );
}
