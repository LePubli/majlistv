// Étape M4 — Ramadan des enfants (comme le site, étape 45F2) ; aucune comparaison entre enfants.
//   KidRamadan        côté enfant (accueil de l'espace Kids, pendant Ramadan) : actions du jour + « Je l'ai fait » (jeton enfant).
//   KidRamadanParent  côté parent (gestion d'un profil) : 7 derniers jours, validation (jeton parent) ; met à jour la pastille.
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { KC } from '@/lib/kids';
import { kidStateKey, type KidRamadanResponse, type ParentRamadanResponse } from '@/lib/ramadan';
import { refreshKidsPending } from '@/lib/kidsPending';
import type { KidProfileFull } from '@/lib/types';
import { KButton, KChip, KTxt } from './KidUi';

export function KidRamadan() {
  const { t, locale, feat } = useSession();
  const { kidApi, kid, epoch } = useKid();
  const [d, setD] = useState<KidRamadanResponse | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const load = useCallback(() => kidApi.get<KidRamadanResponse>('/kids/ramadan', { lang: locale }).then(setD).catch(() => setD(null)), [kidApi, locale]);
  useEffect(() => { if (feat('ramadan')) void load(); }, [load, feat, kid?.profile.id, epoch]);
  if (!d || !d.status.active || !d.items.length) return null;
  const claim = async (id: number) => {
    setBusy(id);
    try { await kidApi.post('/kids/ramadan/claim', { itemId: id }); await load(); } catch { /* reste tel quel */ } finally { setBusy(null); }
  };
  return (
    <View style={{ gap: 10, paddingHorizontal: 20 }}>
      <KTxt weight="extrabold" size={20} accessibilityRole="header">🌙 {t('kzTitle', { n: d.status.day ?? '' })}</KTxt>
      {d.items.map((a) => (
        <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, backgroundColor: KC.surface, borderWidth: 2, borderColor: a.state === 'validated' ? KC.ok : KC.line }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: a.state === 'validated' ? KC.ok : KC.surface2 }}>
            <KTxt weight="extrabold" size={16} color={a.state === 'validated' ? '#06210F' : KC.text2}>{a.state === 'validated' ? '✓' : a.state === 'claimed' ? '…' : ''}</KTxt>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <KTxt weight="extrabold" size={16}>{a.title}</KTxt>
            {a.text ? <KTxt size={13} color={KC.text2}>{a.text}</KTxt> : null}
            {a.state === 'claimed' ? <KTxt size={13} color={KC.text2}>{t('kaWait')}</KTxt> : null}
            {a.state === 'validated' ? <KTxt size={13} color={KC.ok}>{t('kaValidated')}</KTxt> : null}
          </View>
          {a.state === 'todo' ? <KButton label={t('kaDone')} variant="soft" loading={busy === a.id} onPress={() => void claim(a.id)} style={{ minHeight: 48, paddingHorizontal: 16 }} /> : null}
        </View>
      ))}
      <KTxt size={12} color={KC.muted}>⭐ {t('kzCount', { n: d.validated })} · {t('kaParentChecks')}</KTxt>
    </View>
  );
}

export function KidRamadanParent({ profile }: { profile: KidProfileFull }) {
  const { t, api, locale } = useSession();
  const [d, setD] = useState<ParentRamadanResponse | null>(null);
  const [err, setErr] = useState('');
  const base = `/me/kids/profiles/${profile.id}/ramadan`;
  const load = useCallback(() => api.get<ParentRamadanResponse>(base, { lang: locale }).then(setD).catch(() => setD(null)), [api, base, locale]);
  useEffect(() => { void load(); }, [load]);
  if (!d) return <KTxt color={KC.text2}>…</KTxt>;
  const validate = async (day: number, itemId: number) => {
    setErr('');
    try { await api.post(`${base}/validate`, { day, itemId }); await load(); refreshKidsPending(); } catch { setErr(t('common.error')); }
  };
  if (!d.status.active) return <KTxt color={KC.text2}>{t('kzOff')}</KTxt>;
  if (d.days.every((x) => !x.items.length)) return <KTxt color={KC.text2}>{t('kzNone')}</KTxt>;
  return (
    <View style={{ gap: 10 }} accessibilityLabel={t('kzParent', { name: profile.name })}>
      {err ? <KTxt color={KC.danger} accessibilityRole="alert">{err}</KTxt> : null}
      {d.days.map((x) => (
        <View key={x.day} style={{ gap: 6 }}>
          <KTxt weight="bold" size={13} color={KC.muted}>{t('rzDay', { n: x.day })}</KTxt>
          {x.items.map((a) => (
            <View key={a.id} style={{ gap: 6, padding: 12, borderRadius: 16, backgroundColor: KC.surface2, borderWidth: 1, borderColor: a.state === 'claimed' ? KC.accent : KC.line }}>
              <KTxt weight="bold">{a.title}</KTxt>
              <KTxt size={12} color={a.state === 'claimed' ? KC.accent : a.state === 'validated' ? KC.ok : KC.muted}>{t(kidStateKey(a.state))}</KTxt>
              {a.state !== 'validated' ? <View style={{ flexDirection: 'row' }}><KChip label={t('kaValidate')} active={a.state === 'claimed'} onPress={() => void validate(x.day, a.id)} /></View> : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
