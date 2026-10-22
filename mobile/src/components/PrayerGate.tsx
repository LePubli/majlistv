// Pause de la lecture à l'heure de la prière — blocage souple. Même logique que web/components/PrayerGate.js.
// Quand une prière commence et qu'une vidéo ou un son est en cours, la lecture est mise en pause et un écran indique la prière.
// « J'ai prié » et « Continuer quand même » reprennent tout de suite ; sans choix, la pause s'achève toute seule à la fin de la durée réglée.
// Une prière n'interrompt qu'une fois.
import React, { useEffect, useRef, useState } from 'react';
import { Modal, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { usePrayer } from '@/lib/prayerStore';
import { useNow } from '@/lib/useNow';
import { countdown, statusAt } from '@/lib/prayer/prayerLogic';
import { fmtTime } from '@/lib/prayer/prayerTimes';
import { MediaAdapter, playingMedia } from '@/lib/mediaRegistry';
import { colors, radius } from '@/lib/theme';
import { Button, Txt } from '@/components/ui';
import { prayerNameKey } from '@/components/PrayerPill';

export function PrayerGate() {
  const { t, locale, dirStyle } = useSession();
  const prayer = usePrayer();
  const active = prayer.on && prayer.ready && prayer.prefs.enabled && prayer.items.length > 0;
  const now = useNow(1000, active);
  const [blocked, setBlocked] = useState<string | null>(null); // clé de la prière qui a interrompu la lecture
  const paused = useRef<MediaAdapter[]>([]); // lecteurs mis en pause par nous, à reprendre

  const st = active && now != null ? statusAt(prayer.items, now, prayer.prefs) : { current: null, next: null };
  const cur = st.current;

  // Chaque seconde : fenêtre ouverte, prière pas encore traitée, lecture en cours → pause + écran.
  useEffect(() => {
    if (!cur || prayer.done[cur.key] || blocked === cur.key) return;
    const playing = playingMedia();
    if (!playing.length) return;
    playing.forEach((m) => { try { m.pause(); } catch { /* lecteur indisponible */ } });
    paused.current = playing;
    setBlocked(cur.key);
  }, [now, cur, prayer.done, blocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = !!cur && blocked === cur.key && !prayer.done[cur.key];
  const finish = (resume: boolean) => {
    if (cur) prayer.markDone(cur.key);
    if (resume) paused.current.forEach((m) => { try { m.play(); } catch { /* lecture refusée : la personne relancera */ } });
    paused.current = [];
    setBlocked(null);
  };
  // La fenêtre se termine sans choix : on libère l'écran (les lecteurs restent en pause, comme sur le site).
  useEffect(() => { if (blocked && !cur) { paused.current = []; setBlocked(null); } }, [blocked, cur]);

  if (!visible || !cur || now == null) return null;
  const name = t(prayerNameKey(cur.id));
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => finish(true)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(5,4,3,0.86)', justifyContent: 'center', padding: 22 }}>
        <View accessibilityViewIsModal style={[{ borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.goldLine, padding: 24, gap: 10, alignItems: 'center' }, dirStyle]}>
          <Feather name="moon" size={44} color={colors.gold} />
          <Txt weight="bold" size={12} color={colors.muted} style={{ letterSpacing: 1, textTransform: 'uppercase' }}>{t('pryNow')}</Txt>
          <Txt weight="extrabold" size={34} color={colors.goldLight} accessibilityRole="header">{name}</Txt>
          <Txt size={18} style={{ writingDirection: 'ltr' }}>{fmtTime(cur.at, prayer.prefs.loc.tz, locale)}</Txt>
          <Txt color={colors.text2} style={{ textAlign: 'center' }}>{t('pryHelp', { n: prayer.prefs.blockMinutes })}</Txt>
          <Txt size={13} color={colors.muted} style={{ writingDirection: 'ltr' }} accessibilityRole="timer">{t('pryRemaining', { time: countdown(cur.endsAt - now) })}</Txt>
          <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 8 }}>
            <Button label={t('pryPrayed')} onPress={() => finish(true)} />
            <Button variant="dark" label={t('pryContinue')} onPress={() => finish(true)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
