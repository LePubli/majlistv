// Rapport de progression pour le parent : un bloc par enfant, sans classement ni comparaison (mêmes chiffres que le site et l'e-mail).
import React, { useCallback, useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { useSession } from '@/lib/session';
import { ApiError } from '@/lib/api';
import { KC, avatarEmoji, badgeIcon, dayLetter, fmtMinutes, reportDays, usageBars } from '@/lib/kids';
import type { KidReport } from '@/lib/types';
import { KButton, KChip, KTxt } from '@/components/kids/KidUi';

const Tile = ({ label, value }: { label: string; value: string | number }) => (
  <View style={{ minWidth: 96, flexGrow: 1, padding: 12, borderRadius: 16, backgroundColor: KC.surface2, borderWidth: 1, borderColor: KC.line, gap: 2 }}>
    <KTxt weight="extrabold" size={20}>{value}</KTxt><KTxt size={12} color={KC.text2}>{label}</KTxt>
  </View>
);

export function ParentReport() {
  const { t, api, locale } = useSession();
  const [days, setDays] = useState<number>(7);
  const [r, setR] = useState<KidReport | null>(null);
  const [failed, setFailed] = useState(false);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const load = useCallback(() => { setFailed(false); api.get<KidReport>('/me/kids/report', { days }).then(setR).catch(() => setFailed(true)); }, [api, days]);
  useEffect(() => { load(); }, [load]);

  if (failed && !r) return <View style={{ gap: 10 }}><KTxt color={KC.text2}>{t('common.error')}</KTxt><KButton label={t('common.retry')} variant="soft" onPress={load} /></View>;
  if (!r) return <KTxt color={KC.text2}>…</KTxt>;
  if (r.profiles.length === 0) return null;
  const toggle = async (on: boolean) => {
    setR({ ...r, email: on });
    try { await api.put('/me/kids/report-prefs', { email: on }); } catch { setR({ ...r, email: !on }); }
  };
  const sendNow = async () => {
    setSending(true); setMsg('');
    try { await api.post('/me/kids/report/send'); setMsg(t('krSent')); } catch (e) { setMsg(e instanceof ApiError ? e.message : t('common.error')); } finally { setSending(false); }
  };
  return (
    <View style={{ gap: 12 }}>
      <KTxt weight="extrabold" size={22} accessibilityRole="header">{t('krTitle')}</KTxt>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {reportDays.map((d) => <KChip key={d} label={t(d === 7 ? 'krDays7' : 'krDays30')} active={days === d} onPress={() => setDays(d)} />)}
      </View>
      <KTxt size={12} color={KC.muted}>{t('krNoRank')}</KTxt>
      {r.profiles.map((p) => {
        const bars = usageBars(p.usage);
        return (
          <View key={p.id} style={{ gap: 10, padding: 16, borderRadius: 22, backgroundColor: KC.surface, borderWidth: 2, borderColor: KC.line }}>
            <KTxt weight="extrabold" size={18}>{avatarEmoji(p.avatar)} {p.name}</KTxt>
            {!p.active ? <KTxt color={KC.text2}>{t('krNoActivity')}</KTxt> : (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Tile label={t('krTime')} value={fmtMinutes(p.minutes, t as never)} />
                  <Tile label={t('krVideos')} value={p.watched} />
                  <Tile label={t('krQuizzes')} value={p.quizzes} />
                  {p.quizzes > 0 && p.avgPercent != null ? <Tile label={t('krAvg')} value={`${p.avgPercent} %`} /> : null}
                  <Tile label={t('krStars')} value={`+${p.starsGained}`} />
                </View>
                {bars.length <= 31 ? (
                  <View accessible accessibilityLabel={`${t('krPerDay')} : ${bars.map((b) => `${b.day} ${b.min} min`).join(', ')}`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 72 }}>
                    {bars.map((b) => (
                      <View key={b.day} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 72, gap: 2 }}>
                        <View style={{ width: '100%', height: Math.max(2, Math.round(b.pct * 0.5)), borderRadius: 4, backgroundColor: b.min > 0 ? KC.accent : KC.line }} />
                        {bars.length <= 7 ? <KTxt size={10} color={KC.muted}>{dayLetter(b.day, locale)}</KTxt> : null}
                      </View>
                    ))}
                  </View>
                ) : null}
                {p.badges.length > 0 ? <KTxt>{t('krBadges')} : {p.badges.map((c) => badgeIcon(c)).join(' ')}</KTxt> : null}
                {p.retry.length > 0 ? <KTxt size={13} color={KC.text2}>{t('krRetry')} : {p.retry.map((x) => `« ${x} »`).join(', ')}</KTxt> : null}
              </>
            )}
            <KTxt size={12} color={KC.muted}>{p.dailyLimitMin ? t('krLimit', { n: p.dailyLimitMin }) : t('krNoLimit')}</KTxt>
          </View>
        );
      })}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Switch value={r.email} onValueChange={(v) => void toggle(v)} trackColor={{ true: KC.accent, false: KC.line }} accessibilityLabel={t('krEmailOn')} />
        <KTxt style={{ flex: 1 }}>{t('krEmailOn')}</KTxt>
      </View>
      <KButton label={t('krSendNow')} variant="soft" loading={sending} onPress={() => void sendNow()} />
      {msg ? <KTxt size={13} color={KC.text2} accessibilityRole="alert">{msg}</KTxt> : null}
    </View>
  );
}
