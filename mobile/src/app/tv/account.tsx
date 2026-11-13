// Compte sur la télé.
//  - Déconnecté : connexion par code. La télé affiche un code (et un QR code) ; on le valide sur son téléphone ou sur le site
//    (page /tv), déjà connecté ; la télé interroge le serveur toutes les quelques secondes et se connecte toute seule.
//  - Connecté : nom, e-mail, état de l'abonnement, déconnexion.
import React, { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { ApiError } from '@/lib/api';
import { SITE_URL } from '@/lib/config';
import { fmtTvCode } from '@/lib/tv';
import type { BillingStatus, User } from '@/lib/types';
import { colors } from '@/lib/theme';
import { Loading, Txt } from '@/components/ui';
import { TvShell } from '@/components/tv/TvShell';
import { Focusable } from '@/components/tv/Focusable';
import { QrCode } from '@/components/tv/QrCode';

type Start = { code: string; secret: string; expiresIn: number; interval: number; url: string };

export default function TvAccount() {
  const { user } = useSession();
  return <TvShell>{user ? <Signed /> : <CodeLogin />}</TvShell>;
}

function Signed() {
  const { user, api, t, logout } = useSession();
  const billing = useAsync(async () => (user ? await api.get<BillingStatus>('/billing/status').catch(() => null) : null), [user?.id]);
  const subscribed = Boolean(billing.data?.active || billing.data?.learning);
  return (
    <View style={{ padding: 48, gap: 16 }}>
      <Txt weight="extrabold" size={30}>{t('tv.account')}</Txt>
      <Txt weight="bold" size={22}>{user?.name}</Txt>
      <Txt size={17} color={colors.text2}>{user?.email}</Txt>
      <Txt weight="bold" size={18} color={subscribed ? colors.goldLight : colors.text2}>{subscribed ? t('account.active') : t('account.inactive')}</Txt>
      {!subscribed ? <Txt size={15} color={colors.muted}>{t('tv.subscribeOnSite').replace('{site}', SITE_URL.replace(/^https?:\/\//, ''))}</Txt> : null}
      <Focusable first accessibilityRole="button" onPress={() => { void logout().then(() => router.replace('/tv')); }} radius={999}
        style={{ alignSelf: 'flex-start', marginTop: 12, paddingVertical: 12, paddingHorizontal: 26, backgroundColor: colors.panel }}>
        <Txt weight="bold" size={18}>{t('account.logout')}</Txt>
      </Focusable>
      <Txt size={13} color={colors.muted}>{t('account.version', { v: Constants.expoConfig?.version ?? '' })}</Txt>
    </View>
  );
}

function CodeLogin() {
  const { api, t, adopt } = useSession();
  const [s, setS] = useState<Start | null>(null);
  const [err, setErr] = useState('');
  const [round, setRound] = useState(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // Demande d'un code (nouveau code à l'expiration ou après un refus).
  useEffect(() => {
    setS(null); setErr('');
    // Nom de l'appareil montré sur l'écran de confirmation (ex. « Google Chromecast »).
    const pc = (Platform as unknown as { constants?: { Brand?: string; Model?: string } }).constants ?? {};
    const device = [pc.Brand, pc.Model].filter(Boolean).join(' ').slice(0, 80) || 'Télé';
    api.post<Start>('/auth/tv/start', { device }).then((r) => { if (alive.current) setS(r); }).catch(() => { if (alive.current) setErr(t('common.error')); });
  }, [api, round, t]);

  // Attente de la validation : la télé demande au serveur toutes les « interval » secondes.
  useEffect(() => {
    if (!s) return undefined;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const r = await api.post<{ token?: string; user?: User; status?: string }>('/auth/tv/poll', { secret: s.secret });
        if (r.token && r.user) { await adopt({ token: r.token, user: r.user }); router.replace('/tv'); return; }
      } catch (e) {
        if (e instanceof ApiError && e.status === 410) { setRound((n) => n + 1); return; }
      }
      if (!stop) setTimeout(tick, s.interval * 1000);
    };
    const h = setTimeout(tick, s.interval * 1000);
    const expire = setTimeout(() => setRound((n) => n + 1), s.expiresIn * 1000);
    return () => { stop = true; clearTimeout(h); clearTimeout(expire); };
  }, [s, api, adopt]);

  if (!s) return err ? <View style={{ padding: 48 }}><Txt>{err}</Txt></View> : <Loading />;
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 56, padding: 56 }}>
      <View style={{ flex: 1, gap: 18 }}>
        <Txt weight="extrabold" size={30}>{t('tv.loginTitle')}</Txt>
        <Txt size={18} color={colors.text2}>{t('tv.loginStep1').replace('{site}', `${SITE_URL.replace(/^https?:\/\//, '')}/tv`)}</Txt>
        <Txt size={18} color={colors.text2}>{t('tv.loginStep2')}</Txt>
        <View style={{ alignSelf: 'flex-start', paddingVertical: 16, paddingHorizontal: 28, borderRadius: 16, borderWidth: 2, borderColor: colors.gold, backgroundColor: colors.panel }}>
          <Txt weight="extrabold" size={52} style={{ letterSpacing: 8, writingDirection: 'ltr' }}>{fmtTvCode(s.code)}</Txt>
        </View>
        <Txt size={15} color={colors.muted}>{t('tv.loginWait')}</Txt>
        <Focusable first accessibilityRole="button" onPress={() => setRound((n) => n + 1)} radius={999} style={{ alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 22, backgroundColor: colors.panel }}>
          <Txt weight="bold" size={16}>{t('tv.newCode')}</Txt>
        </Focusable>
      </View>
      <View style={{ padding: 18, backgroundColor: '#fff', borderRadius: 16, gap: 10, alignItems: 'center' }}>
        <QrCode value={s.url} size={260} />
        <Txt size={14} color="#111">{t('tv.scan')}</Txt>
      </View>
    </View>
  );
}
