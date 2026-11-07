// Morceaux communs des écrans « Événements en direct » : horloge du décompte et pastille de phase.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSession } from '@/lib/session';
import { fmtCountdown, type LiveEvent } from '@/lib/events';
import { colors } from '@/lib/theme';
import { Txt } from './ui';

/** Horloge à la seconde (le décompte), sans réseau ; arrêtée quand `active` est faux. */
export function useNow(active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!active) return undefined; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [active]);
  return now;
}

export function EventBadge({ ev, now }: { ev: Pick<LiveEvent, 'phase' | 'startsAt'>; now: number }) {
  const { t } = useSession();
  const units = { d: t('evn.d'), h: t('evn.h'), m: t('evn.m'), s: t('evn.s') };
  const base = { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, borderWidth: 1 } as const;
  if (ev.phase === 'live') return <View style={[base, { backgroundColor: '#b3261e', borderColor: '#b3261e' }]}><Txt size={12} weight="bold" color="#fff">● {t('evn.live')}</Txt></View>;
  if (ev.phase === 'ended') return <View style={[base, { borderColor: colors.border }]}><Txt size={12} weight="bold">{t('evn.ended')}</Txt></View>;
  if (ev.phase === 'cancelled') return <View style={[base, { borderColor: colors.border }]}><Txt size={12} weight="bold" color={colors.muted}>{t('evn.cancelled')}</Txt></View>;
  return <View style={[base, { borderColor: colors.goldLight }]}><Txt size={12} weight="bold" color={colors.goldLight}>{t('evn.soon', { t: fmtCountdown(new Date(ev.startsAt).getTime() - now, units) })}</Txt></View>;
}
