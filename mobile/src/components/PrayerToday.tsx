// Onglet « Aujourd'hui » : prochaine prière avec compte à rebours, date du jour et date hégirienne, horaires du jour.
// Même logique que web/components/PrayerPage.js (Today).
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useSession } from '@/lib/session';
import { usePrayer } from '@/lib/prayerStore';
import { useNow } from '@/lib/useNow';
import { countdown, statusAt } from '@/lib/prayer/prayerLogic';
import { civilDate, dayTimes, fmtTime } from '@/lib/prayer/prayerTimes';
import { HIJRI_OK, hijriOfCivil } from '@/lib/prayer/prayerExtras';
import { colors, radius } from '@/lib/theme';
import { Panel, Txt } from '@/components/ui';
import { prayerNameKey } from '@/components/PrayerPill';

const ORDER = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export const nf = (locale: string) => (locale === 'ar' ? 'ar-u-nu-latn' : locale);

export function PrayerToday() {
  const { t, locale, isRTL } = useSession();
  const prayer = usePrayer();
  const { prefs, cfg, items } = prayer;
  const now = useNow(1000, true);
  const { tz } = prefs.loc;
  const base = now == null ? null : civilDate(now, tz);
  const times = useMemo(() => (base ? dayTimes({ lat: prefs.loc.lat, lon: prefs.loc.lon, y: base.y, m: base.m, d: base.d, method: prefs.method, asr: prefs.asr, highLat: prefs.highLat }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base?.y, base?.m, base?.d, prefs]);
  if (now == null || !base || !times) return <Txt color={colors.muted}>…</Txt>;

  const st = statusAt(items, now, prefs);
  const nowPrayer = !!st.current && now - st.current.at < 3 * 60_000;
  // La prochaine prière peut être celle de demain (après Isha) : on l'indique et on ne surligne rien dans la liste d'aujourd'hui.
  const nextDay = st.next ? civilDate(st.next.at, tz) : null;
  const tomorrow = !nowPrayer && !!nextDay && (nextDay.y !== base.y || nextDay.m !== base.m || nextDay.d !== base.d);
  const focus = nowPrayer && st.current ? st.current.id : tomorrow ? null : st.next?.id;
  const left = st.next ? st.next.at - now : 0;
  const greg = new Intl.DateTimeFormat(nf(locale), { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(now));
  const hij = HIJRI_OK ? hijriOfCivil(base, cfg?.hijriOffset ?? 0) : null;
  const side = { textAlign: isRTL ? 'right' : 'left' } as const;
  const shown = nowPrayer && st.current ? st.current : st.next;

  return (
    <View style={{ gap: 14 }}>
      <Panel style={{ borderColor: colors.goldLine, backgroundColor: colors.goldTint }}>
        <Txt weight="bold" size={12} color={colors.goldLight} style={{ letterSpacing: 0.8, textTransform: 'uppercase', ...side }}>{t('pryNext')}</Txt>
        {shown ? (
          <>
            <Txt weight="extrabold" size={26} style={side}>
              {t(prayerNameKey(shown.id))} <Txt weight="extrabold" size={26} style={{ writingDirection: 'ltr' }}>{fmtTime(shown.at, tz, locale)}</Txt>
              {tomorrow ? <Txt size={14} color={colors.muted}> · {t('pqTomorrow')}</Txt> : null}
            </Txt>
            <Txt color={colors.text2} style={side}>
              {nowPrayer ? t('pqNowIs') : t('pqLeft', { time: countdown(left).replace(/ /g, ' ') })}
            </Txt>
          </>
        ) : <Txt color={colors.muted}>—</Txt>}
        <View style={{ gap: 2, marginTop: 4 }}>
          <Txt weight="bold" style={side}>{greg}</Txt>
          {hij ? <Txt color={colors.goldLight} style={side}>{`${hij.day} ${t(('pqH' + hij.month) as never)} ${hij.year}`}</Txt> : null}
        </View>
      </Panel>

      <Panel style={{ gap: 4 }}>
        {ORDER.map((id) => {
          const on = id === focus;
          return (
            <View key={id} accessibilityState={{ selected: on }} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.input,
              backgroundColor: on ? colors.goldTint : 'transparent' }}>
              <Txt weight={on ? 'bold' : 'regular'} color={on ? colors.goldLight : id === 'sunrise' ? colors.muted : colors.text2}>{t(prayerNameKey(id))}</Txt>
              <Txt weight="bold" color={id === 'sunrise' ? colors.muted : colors.text} style={{ writingDirection: 'ltr' }}>{fmtTime(times[id].getTime(), tz, locale)}</Txt>
            </View>
          );
        })}
      </Panel>
      <Txt size={12} color={colors.muted} style={side}>{t('pqNote', { method: t(('pryM' + prefs.method) as never) })}</Txt>
    </View>
  );
}
