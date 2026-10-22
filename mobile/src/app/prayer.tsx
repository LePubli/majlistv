// Réglages de la prière : pause de lecture, pastille, rappel sur le téléphone, lieu, méthode de calcul, prières concernées.
// Mêmes réglages et mêmes limites que la page /priere du site (web/components/PrayerSettings.js).
import React, { useEffect, useState } from 'react';
import { AppState, Linking, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { usePrayer } from '@/lib/prayerStore';
import { searchCities } from '@/lib/prayer/prayerCities';
import { METHOD_IDS, PRAYERS, fmtTime } from '@/lib/prayer/prayerTimes';
import { askExactAlarms, exactAlarmsAllowed, notificationPermission, PermState } from '@/lib/notifications';
import { colors, radius } from '@/lib/theme';
import { Button, Chip, Panel, Txt, screenStyle, Title } from '@/components/ui';
import { AppHeader } from '@/components/AppHeader';
import { prayerNameKey, todayRows } from '@/components/PrayerPill';
import { TextInput } from 'react-native';

function Row({ label, help, value, onChange }: { label: string; help?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt weight="bold">{label}</Txt>
        {help ? <Txt size={12} color={colors.muted}>{help}</Txt> : null}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ false: colors.border, true: colors.goldLine }} thumbColor={value ? colors.gold : colors.muted} />
    </View>
  );
}

export default function PrayerSettingsScreen() {
  const { t, locale, dirStyle, isRTL } = useSession();
  const prayer = usePrayer();
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [perm, setPerm] = useState<PermState>('undetermined');
  const [exact, setExact] = useState(true);
  const refresh = async () => { setPerm(await notificationPermission(false)); setExact(await exactAlarmsAllowed()); };
  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void refresh(); });
    return () => sub.remove();
  }, []);

  const { prefs, cfg, items } = prayer;
  const place = prefs.loc.mode === 'geo' ? t('pryMyPos') : prefs.loc.name;
  const results = q.trim() ? searchCities(q) : [];
  const rows = todayRows(items, Date.now(), prefs.loc.tz);
  const max = cfg?.maxBlockMinutes ?? 30;
  const ticked = prefs.prayers as Record<string, boolean>;
  const sideAlign = { textAlign: isRTL ? 'right' : 'left' } as const;

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={[]}>
      <AppHeader />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Title>{t('prySetTitle')}</Title>
        {!prayer.on ? <Txt color={colors.muted}>{t('ftOffText')}</Txt> : (
          <>
            <Txt color={colors.text2} style={sideAlign}>{t('prySetIntro')}</Txt>

            <Panel>
              <Row label={t('prySetPause')} value={prefs.enabled} onChange={(v) => void prayer.save({ enabled: v })} />
              {!prefs.enabled ? <Txt size={12} color={colors.muted}>{t('prySetOff')}</Txt> : null}
              <Row label={t('prySetPill')} value={prefs.pill} onChange={(v) => void prayer.save({ pill: v })} />
            </Panel>

            <Panel>
              <Txt weight="bold" size={12} color={colors.muted} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>{t('np.title')}</Txt>
              <Row label={t('np.prayer')} help={t('np.prayerHelp')} value={prayer.notify} onChange={(v) => { void prayer.setNotify(v).then(refresh); }} />
              {prayer.notify && perm !== 'granted' ? (
                <View style={{ gap: 8 }}>
                  <Txt size={13} color={colors.goldLight}>{t('np.denied')}</Txt>
                  <Button variant="dark" label={t('np.openSettings')} onPress={() => { void Linking.openSettings(); }} />
                </View>
              ) : null}
              {prayer.notify && perm === 'granted' && !exact ? (
                <View style={{ gap: 8 }}>
                  <Txt weight="bold" size={14}>{t('np.exact')}</Txt>
                  <Txt size={12} color={colors.muted}>{t('np.exactHelp')}</Txt>
                  <Button variant="dark" label={t('np.exactBtn')} onPress={() => { void askExactAlarms().then(refresh); }} />
                </View>
              ) : null}
            </Panel>

            <Panel>
              <Txt weight="bold" size={12} color={colors.muted} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>{t('prySetPlace')}</Txt>
              <Txt weight="bold">{place} <Txt size={12} color={colors.muted}>({prefs.loc.tz})</Txt></Txt>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput value={q} onChangeText={setQ} placeholder={t('prySetCityPh')} placeholderTextColor={colors.placeholder} accessibilityLabel={t('prySetCity')}
                  autoCorrect={false} style={{ flex: 1, minHeight: 44, borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, color: colors.text, paddingHorizontal: 14, ...sideAlign }} />
                <Button variant="dark" label={t('pryLocate')} onPress={async () => { setMsg(t('pryLocating')); const r = await prayer.locate(); setMsg(r.ok ? '' : t('pryLocateDenied')); }} />
              </View>
              {q.trim() ? (results.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {results.map((r: { id: string; name: string }) => <Chip key={r.id} label={r.name} onPress={() => { setQ(''); void prayer.save({ loc: { mode: 'city', city: r.id } }); }} />)}
                </View>
              ) : <Txt size={12} color={colors.muted}>{t('prySetNoCity')}</Txt>) : null}
              {msg ? <Txt size={12} color={colors.goldLight}>{msg}</Txt> : null}
            </Panel>

            <Panel>
              <Txt weight="bold" size={12} color={colors.muted} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>{t('prySetMethod')}</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {METHOD_IDS.map((m: string) => <Chip key={m} label={t(('pryM' + m) as never)} active={prefs.method === m} onPress={() => void prayer.save({ method: m })} />)}
              </View>
              <Txt weight="bold" size={12} color={colors.muted} style={{ letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 6 }}>{t('prySetAsr')}</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Chip label={t('prySetAsrStd')} active={prefs.asr === 'standard'} onPress={() => void prayer.save({ asr: 'standard' })} />
                <Chip label={t('prySetAsrHan')} active={prefs.asr === 'hanafi'} onPress={() => void prayer.save({ asr: 'hanafi' })} />
              </View>
            </Panel>

            <Panel>
              <Txt weight="bold" size={12} color={colors.muted} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>{t('prySetBlock')}</Txt>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
                <Button variant="dark" accessibilityLabel="−" icon={<Feather name="minus" size={18} color={colors.text} />} onPress={() => void prayer.save({ blockMinutes: Math.max(1, prefs.blockMinutes - 1) })} style={{ minWidth: 56 }} />
                <Txt weight="extrabold" size={22} style={{ minWidth: 50, textAlign: 'center' }}>{prefs.blockMinutes}</Txt>
                <Button variant="dark" accessibilityLabel="+" icon={<Feather name="plus" size={18} color={colors.text} />} onPress={() => void prayer.save({ blockMinutes: Math.min(max, prefs.blockMinutes + 1) })} style={{ minWidth: 56 }} />
              </View>
              <Txt size={12} color={colors.muted}>{t('prySetBlockHelp', { max })}</Txt>
              <Txt weight="bold" size={12} color={colors.muted} style={{ letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 6 }}>{t('prySetPrayers')}</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(PRAYERS as string[]).map((id) => (
                  <Chip key={id} label={t(prayerNameKey(id))} active={ticked[id]} onPress={() => void prayer.save({ prayers: { ...ticked, [id]: !ticked[id] } })} />
                ))}
              </View>
            </Panel>

            {rows.length ? (
              <Panel>
                <Txt weight="bold" size={12} color={colors.muted} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>{t('prySetToday')}</Txt>
                {rows.map((r) => (
                  <View key={r.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Txt color={colors.text2}>{t(prayerNameKey(r.id))}</Txt>
                    <Txt weight="bold" style={{ writingDirection: 'ltr' }}>{fmtTime(r.at, prefs.loc.tz, locale)}</Txt>
                  </View>
                ))}
              </Panel>
            ) : null}
            <Txt size={12} color={colors.muted} style={sideAlign}>{t('prySetPrivacy')}</Txt>
            <Button variant="dark" label={t('common.close')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
