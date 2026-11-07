// Événement en direct : décompte, direct intégré (YouTube / Vimeo) dès l'ouverture, rappel, agenda, rediffusion.
import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { API_URL } from '@/lib/config';
import { validEmbedId } from '@/lib/embed';
import { calendarUrl, fmtWhen, isOpenEvent, nextRefreshMs, type LiveEvent } from '@/lib/events';
import { colors, radius } from '@/lib/theme';
import { Button, ErrorBox, Loading, ScreenHeader, Txt, screenStyle } from '@/components/ui';
import { ExternalVideo } from '@/components/ExternalVideo';
import { EventBadge, useNow } from '@/components/EventParts';

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, t, dirStyle, locale, user } = useSession();
  const d = useAsync(() => api.get<LiveEvent>(`/events/${id}`), [id, user?.id]);
  const [reminded, setReminded] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const ev = d.data;
  const open = ev ? isOpenEvent(ev) : false;
  const now = useNow(open);
  useEffect(() => { if (ev) setReminded(ev.reminded); }, [ev?.reminded]); // eslint-disable-line react-hooks/exhaustive-deps
  // Annoncé → direct → terminé : la fiche est relue à l'heure d'ouverture, puis chaque minute pendant le direct.
  useEffect(() => {
    if (!ev) return undefined;
    const ms = nextRefreshMs(ev, Date.now());
    if (ms == null) return undefined;
    const h = setTimeout(() => { void d.reload(); }, ms);
    return () => clearTimeout(h);
  }, [ev?.phase, ev?.startsAt, ev]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async () => {
    if (!ev) return;
    if (!user) { router.push('/login'); return; }
    setBusy(true);
    try {
      const r = reminded ? await api.del<{ reminded: boolean }>(`/me/events/${ev.id}/remind`) : await api.put<{ reminded: boolean }>(`/me/events/${ev.id}/remind`);
      setReminded(r.reminded);
    } catch { /* le bouton garde son état : l'utilisateur peut réessayer */ } finally { setBusy(false); }
  };

  const canPlay = ev?.phase === 'live' && !!ev.video && validEmbedId(ev.video.source, ev.video.ref);
  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top', 'bottom']}>
      <ScreenHeader title={t('evn.title')} />
      {d.loading && !ev ? <Loading /> : !ev ? <ErrorBox message={t('evn.missing')} onRetry={d.reload} /> : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}>
          <View style={{ flexDirection: 'row' }}><EventBadge ev={ev} now={now} /></View>
          <Txt weight="extrabold" size={22}>{ev.title}</Txt>
          {ev.speaker ? <Txt size={14} color={colors.text2}>{ev.speaker}</Txt> : null}
          <Txt size={13} color={colors.muted}>{t('evn.starts', { d: fmtWhen(ev.startsAt, locale) })} · {t('evn.duration', { n: ev.durationMinutes })}</Txt>

          {canPlay && ev.video ? (
            <View style={{ aspectRatio: 16 / 9, borderRadius: radius.card, overflow: 'hidden', backgroundColor: '#000' }}>
              <ExternalVideo kind={ev.video.source} id={ev.video.ref} startSeconds={0} limitSeconds={0} onMessage={() => {}} />
            </View>
          ) : ev.phase === 'upcoming' ? (
            <View style={{ padding: 14, borderRadius: radius.card, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border }}><Txt size={14} color={colors.text2}>{t('evn.liveStarts')}</Txt></View>
          ) : ev.phase === 'ended' && !ev.replay ? (
            <View style={{ padding: 14, borderRadius: radius.card, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border }}><Txt size={14} color={colors.text2}>{t('evn.noReplay')}</Txt></View>
          ) : null}

          <View style={{ gap: 10 }}>
            {ev.replay ? <Button label={`▶ ${t('evn.replay')}`} onPress={() => router.push({ pathname: '/talk/[id]', params: { id: ev.replay!.talkId } })} /> : null}
            {open ? (
              <>
                <Button variant={reminded ? 'dark' : 'gold'} loading={busy} label={user ? (reminded ? `✓ ${t('evn.reminded')}` : `🔔 ${t('evn.remind')}`) : t('evn.loginRemind')} onPress={toggle} />
                <Button variant="dark" label={`📅 ${t('evn.calendar')}`} onPress={() => { void Linking.openURL(calendarUrl(API_URL, ev.id)); }} />
              </>
            ) : null}
          </View>
          {ev.description ? <Txt size={15} color={colors.text2}>{ev.description}</Txt> : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
