// Pastille « Prochaine prière » de l'en-tête : nom de la prière et compte à rebours ; un appui ouvre les horaires du jour.
// Dorée quand il reste 10 minutes ou moins. Même logique que web/components/PrayerPill.js.
import React, { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { usePrayer } from '@/lib/prayerStore';
import { useNow } from '@/lib/useNow';
import { countdown, statusAt } from '@/lib/prayer/prayerLogic';
import { civilDate, fmtTime } from '@/lib/prayer/prayerTimes';
import { colors, radius } from '@/lib/theme';
import { Button, Txt } from '@/components/ui';

const ORDER = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
export const prayerNameKey = (id: string) => ('pry' + id[0].toUpperCase() + id.slice(1)) as never;

/** Horaires d'aujourd'hui (jour civil du lieu choisi), dans l'ordre de la journée. */
export function todayRows(items: { id: string; at: number }[], now: number, tz: string) {
  const key = (ms: number) => { const c = civilDate(ms, tz); return `${c.y}-${c.m}-${c.d}`; };
  const k = key(now);
  return ORDER.map((id) => items.find((x) => x.id === id && key(x.at) === k)).filter(Boolean) as { id: string; at: number }[];
}

export function PrayerPill({ compact = false }: { compact?: boolean }) {
  const { t, locale, dirStyle } = useSession();
  const prayer = usePrayer();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const show = prayer.on && prayer.ready && prayer.prefs.pill && prayer.items.length > 0;
  const now = useNow(1000, show);
  if (!show || now == null) return null;
  const { prefs, items } = prayer;
  const st = statusAt(items, now, prefs);
  if (!st.next) return null;
  const nowPrayer = !!st.current && now - st.current.at < 3 * 60_000; // « maintenant » pendant les 3 premières minutes
  const left = st.next.at - now;
  const soon = left <= 10 * 60_000 || nowPrayer;
  const name = t(prayerNameKey(nowPrayer && st.current ? st.current.id : st.next.id));
  const time = countdown(left);
  const place = prefs.loc.mode === 'geo' ? t('pryMyPos') : prefs.loc.name;
  const rows = todayRows(items, now, prefs.loc.tz);
  const fg = soon ? colors.onGold : colors.goldLight;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nowPrayer ? t('pryAriaNow', { name }) : t('pryAria', { name, time })}
        onPress={() => setOpen(true)}
        style={{ height: 36, paddingHorizontal: 11, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6,
          backgroundColor: soon ? colors.gold : colors.goldTint, borderWidth: 1, borderColor: soon ? colors.gold : colors.goldLine }}
      >
        <Feather name="moon" size={14} color={fg} />
        {!compact ? <Txt weight="bold" size={12} color={fg} numberOfLines={1}>{name}</Txt> : null}
        <Txt weight="extrabold" size={12} color={fg} style={{ writingDirection: 'ltr' }}>{nowPrayer ? '●' : time}</Txt>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 22 }} onPress={() => setOpen(false)} accessibilityLabel={t('common.close')}>
          <Pressable onPress={() => undefined} style={[{ borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 10 }, dirStyle]}>
            <Txt weight="extrabold" size={17}>{t('pryToday')}</Txt>
            {rows.map((r) => (
              <View key={r.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12,
                backgroundColor: r.id === st.next?.id ? colors.goldTint : 'transparent' }}>
                <Txt color={r.id === st.next?.id ? colors.goldLight : colors.text2} weight={r.id === st.next?.id ? 'bold' : 'regular'}>{t(prayerNameKey(r.id))}</Txt>
                <Txt weight="bold" style={{ writingDirection: 'ltr' }}>{fmtTime(r.at, prefs.loc.tz, locale)}</Txt>
              </View>
            ))}
            <Txt size={12} color={colors.muted}>{t('pryPlace', { place })} · {t(('pryM' + prefs.method) as never)}</Txt>
            {msg ? <Txt size={12} color={colors.goldLight}>{msg}</Txt> : null}
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              <Button variant="dark" label={t('pryLocate')} style={{ flex: 1 }} onPress={async () => { setMsg(t('pryLocating')); const r = await prayer.locate(); setMsg(r.ok ? '' : t('pryLocateDenied')); }} />
              <Button variant="gold" label={t('np.prayerSettings')} style={{ flex: 1 }} onPress={() => { setOpen(false); router.push('/prayer'); }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
