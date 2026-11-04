// Onglet « Calendrier du mois » : une carte par jour avec la date hégirienne (+ jours blancs) et les six horaires.
// Même calcul que web/components/PrayerPage.js (Month) ; pas d'impression sur le téléphone.
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { usePrayer } from '@/lib/prayerStore';
import { civilDate, fmtTime } from '@/lib/prayer/prayerTimes';
import { HIJRI_OK, monthTable, shiftMonth } from '@/lib/prayer/prayerExtras';
import { colors, radius } from '@/lib/theme';
import { Panel, Txt } from '@/components/ui';
import { prayerNameKey } from '@/components/PrayerPill';
import { nf } from '@/components/PrayerToday';

const IDS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

export function PrayerMonth() {
  const { t, locale, isRTL } = useSession();
  const { prefs, cfg } = usePrayer();
  const { tz } = prefs.loc;
  const [cur, setCur] = useState<{ y: number; m: number } | null>(null);
  useEffect(() => { const c = civilDate(Date.now(), tz); setCur({ y: c.y, m: c.m }); }, [tz]);
  const rows = useMemo(() => (cur ? monthTable({ lat: prefs.loc.lat, lon: prefs.loc.lon, tz, method: prefs.method, asr: prefs.asr, highLat: prefs.highLat, y: cur.y, m: cur.m, hijriOffset: cfg?.hijriOffset ?? 0 }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cur, prefs, cfg?.hijriOffset]);
  if (!cur) return <Txt color={colors.muted}>…</Txt>;

  const today = civilDate(Date.now(), tz);
  const title = new Intl.DateTimeFormat(nf(locale), { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(cur.y, cur.m - 1, 1)));
  const dow = (d: number) => new Intl.DateTimeFormat(nf(locale), { timeZone: 'UTC', weekday: 'short' }).format(new Date(Date.UTC(cur.y, cur.m - 1, d)));
  const side = { textAlign: isRTL ? 'right' : 'left' } as const;
  const arrow = (dir: -1 | 1) => (
    <Pressable accessibilityRole="button" accessibilityLabel={dir < 0 ? t('pqPrevMonth') : t('pqNextMonth')} onPress={() => setCur((c) => (c ? shiftMonth(c, dir) : c))}
      style={{ width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }}>
      <Feather name={(dir < 0) !== isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.text} />
    </Pressable>
  );

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {arrow(-1)}
        <Txt weight="extrabold" size={18} accessibilityLiveRegion="polite">{title}</Txt>
        {arrow(1)}
      </View>
      {rows.map((r) => {
        const isToday = today.y === cur.y && today.m === cur.m && today.d === r.d;
        const white = HIJRI_OK && r.white;
        return (
          <Panel key={r.d} style={{ gap: 8, padding: 12, borderColor: isToday ? colors.gold : white ? colors.goldLine : colors.border, backgroundColor: isToday ? colors.goldTint : colors.panel }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Txt weight="extrabold" color={isToday ? colors.goldLight : colors.text} style={side}>{dow(r.d)} {r.d}</Txt>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
                {white ? <Txt size={11} weight="bold" color={colors.onGold} style={{ backgroundColor: colors.gold, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' }}>{t('pqWhite')}</Txt> : null}
                {HIJRI_OK ? <Txt size={12} color={colors.muted} numberOfLines={1}>{`${r.hijri.day} ${t(('pqH' + r.hijri.month) as never)}`}</Txt> : null}
              </View>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {IDS.map((id) => (
                <View key={id} style={{ alignItems: 'center', flex: 1, gap: 2 }}>
                  <Txt size={10} color={colors.muted} numberOfLines={1} maxFontSizeMultiplier={1.1}>{t(prayerNameKey(id))}</Txt>
                  <Txt size={12} weight="bold" maxFontSizeMultiplier={1.1} style={{ writingDirection: 'ltr' }}>{fmtTime(r.times[id], tz, locale)}</Txt>
                </View>
              ))}
            </View>
          </Panel>
        );
      })}
      <Txt size={12} color={colors.muted} style={side}>{HIJRI_OK ? `${t('pqHijriNote')} ${t('pqWhiteNote')}` : t('pqNote', { method: t(('pryM' + prefs.method) as never) })}</Txt>
    </View>
  );
}
