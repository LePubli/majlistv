// Onglet « Qibla » : direction en degrés depuis le lieu choisi + boussole du téléphone (le cadran tourne, la flèche dorée se place face à la Qibla).
// Même calcul que web/components/PrayerPage.js (Qibla). Boussole : expo-location (watchHeadingAsync), voir src/lib/useCompass.ts.
import React, { useMemo } from 'react';
import { Switch, View } from 'react-native';
import { useSession } from '@/lib/session';
import { usePrayer } from '@/lib/prayerStore';
import { compassIndex, qibla, turnTo } from '@/lib/prayer/prayerExtras';
import { useCompass } from '@/lib/useCompass';
import { colors } from '@/lib/theme';
import { Panel, Txt } from '@/components/ui';

const SIZE = 260;

export function PrayerQibla() {
  const { t, isRTL } = useSession();
  const { prefs } = usePrayer();
  const place = prefs.loc.mode === 'geo' ? t('pryMyPos') : prefs.loc.name;
  const q = useMemo(() => qibla(prefs.loc.lat, prefs.loc.lon), [prefs.loc.lat, prefs.loc.lon]);
  const compass = useCompass();
  const live = compass.state === 'on' || compass.state === 'wait';
  const rot = compass.state === 'on' && compass.heading != null ? -compass.heading : 0;
  const diff = compass.state === 'on' && compass.heading != null ? turnTo(compass.heading, q.bearing) : null;
  const aligned = diff != null && Math.abs(diff) <= 5;
  const dir = t(('pqDir' + compassIndex(q.bearing)) as never);
  const side = { textAlign: isRTL ? 'right' : 'left' } as const;
  const msg = compass.state === 'denied' ? t('pqLiveDenied') : compass.state === 'none' ? t('pqLiveNone') : compass.state === 'wait' ? t('pqLiveWait')
    : diff == null ? t('pqLiveIdle') : aligned ? t('pqAimOk') : t(diff > 0 ? 'pqTurnR' : 'pqTurnL', { deg: Math.round(Math.abs(diff)) });
  const gold = aligned ? colors.ok : colors.gold;
  const label = (txt: string, style: object, main = false) => (
    <Txt weight="extrabold" size={main ? 18 : 14} color={main ? colors.goldLight : colors.muted} style={[{ position: 'absolute', width: 30, textAlign: 'center' }, style]}>{txt}</Txt>
  );

  return (
    <View style={{ gap: 14 }}>
      <Panel style={{ alignItems: 'center', gap: 12 }}>
        <View accessible accessibilityRole="image" accessibilityLabel={t('pqQAria', { deg: Math.round(q.bearing), dir })}
          style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 3, borderColor: gold, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
          {/* Cadran : tourne à l'opposé du cap du téléphone ; le nord reste au nord. */}
          <View style={{ position: 'absolute', width: SIZE, height: SIZE, transform: [{ rotate: `${rot}deg` }] }}>
            {label(t('pqN'), { top: 8, left: SIZE / 2 - 15 }, true)}
            {label(t('pqS'), { bottom: 8, left: SIZE / 2 - 15 })}
            {label(t('pqE'), { right: 8, top: SIZE / 2 - 12 })}
            {label(t('pqW'), { left: 8, top: SIZE / 2 - 12 })}
            {/* Flèche vers la Kaaba : tournée de l'angle de la Qibla depuis le nord. */}
            <View style={{ position: 'absolute', width: SIZE, height: SIZE, transform: [{ rotate: `${q.bearing}deg` }], alignItems: 'center' }}>
              <View style={{ marginTop: 40, width: 22, height: 22, borderRadius: 11, backgroundColor: gold, borderWidth: 3, borderColor: colors.bg }} />
              <View style={{ width: 6, height: SIZE / 2 - 62, backgroundColor: gold, borderRadius: 3 }} />
            </View>
          </View>
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: colors.text }} />
        </View>
        <Txt weight="extrabold" size={22} style={{ writingDirection: 'ltr' }}>{Math.round(q.bearing)}° <Txt size={15} color={colors.goldLight}>{dir}</Txt></Txt>
        <Txt size={12} color={colors.muted} style={[side, { alignSelf: 'stretch' }]}>
          {t('pqQFrom', { place, deg: q.bearing.toFixed(0), km: new Intl.NumberFormat('fr-FR').format(q.distanceKm) })}
        </Txt>
      </Panel>

      <Panel>
        <Txt weight="extrabold" size={16} style={side}>{t('pqLiveTitle')}</Txt>
        <Txt color={colors.text2} style={side}>{t('pqLiveText')}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Txt weight="bold" style={[{ flex: 1 }, side]}>{t('pqLiveSwitch')}</Txt>
          <Switch value={live} onValueChange={(v) => (v ? void compass.start() : compass.stop())} accessibilityLabel={t('pqLiveSwitch')}
            trackColor={{ false: colors.border, true: colors.goldLine }} thumbColor={live ? colors.gold : colors.muted} />
        </View>
        <Txt weight="bold" color={aligned ? colors.ok : colors.goldLight} accessibilityLiveRegion="polite" style={side}>{msg}</Txt>
        <Txt size={12} color={colors.muted} style={side}>{t('pqLiveHelp')}</Txt>
      </Panel>
    </View>
  );
}
