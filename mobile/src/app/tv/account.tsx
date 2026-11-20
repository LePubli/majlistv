// Compte sur la télé.
//  - Déconnecté : connexion par code. La télé affiche un code (et un QR code) ; on le valide sur son téléphone ou sur le site
//    (page /tv), déjà connecté ; la télé interroge le serveur toutes les quelques secondes et se connecte toute seule.
//  - Connecté : nom, e-mail, état de l'abonnement, déconnexion.
import React, { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { ApiError } from '@/lib/api';
import { SITE_URL } from '@/lib/config';
import { fmtTvCode } from '@/lib/tv';
import type { BillingStatus, User } from '@/lib/types';
import { tvc, useTv } from '@/lib/tvTheme';
import { Loading, Txt } from '@/components/ui';
import { TvShell } from '@/components/tv/TvShell';
import { TvButton } from '@/components/tv/TvButton';
import { TvMessage } from '@/components/tv/TvMessage';
import { QrCode } from '@/components/tv/QrCode';

type Start = { code: string; secret: string; expiresIn: number; interval: number; url: string };

export default function TvAccount() {
  const { user } = useSession();
  return <TvShell>{user ? <Signed /> : <CodeLogin />}</TvShell>;
}

function Signed() {
  const { user, api, t, logout, feat } = useSession();
  const { u } = useTv();
  const billing = useAsync(async () => (user ? await api.get<BillingStatus>('/billing/status').catch(() => null) : null), [user?.id]);
  const subscribed = Boolean(billing.data?.active || billing.data?.learning);
  const plan = billing.data?.learning ? t('tv.planLearning') : billing.data?.active ? t('tv.planStandard') : '';
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();
  const card = { padding: u(36), borderRadius: u(26), backgroundColor: tvc.panel } as const;
  const site = SITE_URL.replace(/^https?:\/\//, '');
  return (
    <ScrollView contentContainerStyle={{ paddingTop: u(54), paddingBottom: u(80), paddingStart: u(88), paddingEnd: u(96), gap: u(36), maxWidth: u(1300) }}>
      <Txt weight="extrabold" size={u(52)}>{t('tv.account')}</Txt>
      <View style={[card, { flexDirection: 'row', alignItems: 'center', gap: u(30) }]}>
        <View style={{ width: u(120), height: u(120), borderRadius: u(60), alignItems: 'center', justifyContent: 'center', backgroundColor: tvc.accent }}>
          <Txt weight="extrabold" size={u(52)}>{initial}</Txt>
        </View>
        <View style={{ flex: 1, gap: u(10) }}>
          <Txt weight="extrabold" size={u(40)} numberOfLines={1}>{user?.name}</Txt>
          <Txt size={u(24)} color={tvc.muted} numberOfLines={1}>{user?.email}</Txt>
        </View>
      </View>
      <View style={[card, { flexDirection: 'row', alignItems: 'center', gap: u(30) }]}>
        <View style={{ flex: 1, gap: u(14) }}>
          <Txt weight="bold" size={u(20)} color={tvc.muted} style={{ letterSpacing: u(2.4), textTransform: 'uppercase' }}>{t('tv.subscription')}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(14) }}>
            <View style={{ width: u(14), height: u(14), borderRadius: u(7), backgroundColor: subscribed ? tvc.ok : tvc.faint }} />
            <Txt weight="bold" size={u(30)}>{subscribed ? [t('account.active'), plan].filter(Boolean).join(' · ') : t('account.inactive')}</Txt>
          </View>
        </View>
        <Txt size={u(21)} color={tvc.muted} style={{ maxWidth: u(420), textAlign: 'right', lineHeight: u(30) }}>
          {subscribed ? t('tv.manageOnSite') : t('tv.subscribeOnSite').replace('{site}', site)}
        </Txt>
      </View>
      {feat('kids') ? (
        <View style={{ gap: u(12) }}>
          <Txt weight="bold" size={u(20)} color={tvc.muted} style={{ letterSpacing: u(2.4), textTransform: 'uppercase' }}>Mejliss Kids</Txt>
          <Txt size={u(24)} color={tvc.text2} style={{ lineHeight: u(35) }}>{t('tv.kidsManage')}</Txt>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row' }}>
        <TvButton first label={t('tv.logoutTv')} icon="log-out" onPress={() => { void logout().then(() => router.replace('/tv')); }} />
      </View>
      <Txt size={u(20)} color={tvc.faint}>{t('account.version', { v: Constants.expoConfig?.version ?? '' })}</Txt>
    </ScrollView>
  );
}

function CodeLogin() {
  const { api, t, adopt } = useSession();
  const { u } = useTv();
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

  if (!s) return err ? <TvMessage text={err} onBack={() => setRound((n) => n + 1)} /> : <Loading />;
  const code = fmtTvCode(s.code);
  return (
    <ScrollView contentContainerStyle={{ paddingTop: u(110), paddingBottom: u(60), paddingHorizontal: u(88), alignItems: 'center', gap: u(56) }}>
      <Txt weight="extrabold" size={u(56)} style={{ textAlign: 'center' }}>{t('tv.loginTitle')}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: u(70) }}>
        <View style={{ width: u(700), gap: u(30) }}>
          <View style={{ flexDirection: 'row', gap: u(22) }}>
            <View style={{ width: u(52), height: u(52), borderRadius: u(26), alignItems: 'center', justifyContent: 'center', backgroundColor: tvc.accent }}><Txt weight="extrabold" size={u(24)}>1</Txt></View>
            <Txt weight="bold" size={u(28)} color={tvc.text2} style={{ flex: 1, lineHeight: u(40) }}>{t('tv.loginStep1').replace('{site}', `${SITE_URL.replace(/^https?:\/\//, '')}/tv`)}</Txt>
          </View>
          <View style={{ flexDirection: 'row', gap: u(22) }}>
            <View style={{ width: u(52), height: u(52), borderRadius: u(26), alignItems: 'center', justifyContent: 'center', backgroundColor: tvc.accent }}><Txt weight="extrabold" size={u(24)}>2</Txt></View>
            <Txt weight="bold" size={u(28)} color={tvc.text2} style={{ flex: 1, lineHeight: u(40) }}>{t('tv.loginStep2')}</Txt>
          </View>
          <View style={{ flexDirection: 'row', gap: u(14), marginStart: u(74), direction: 'ltr' }} accessibilityLabel={code}>
            {code.split('').map((ch, i) => ch === ' ' ? <View key={i} style={{ width: u(22) }} /> : (
              <View key={i} style={{ width: u(62), height: u(96), borderRadius: u(16), alignItems: 'center', justifyContent: 'center', backgroundColor: tvc.panel }}>
                <Txt weight="extrabold" size={u(54)}>{ch}</Txt>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(12), marginStart: u(74) }}>
            <View style={{ width: u(12), height: u(12), borderRadius: u(6), backgroundColor: tvc.accentLight }} />
            <Txt size={u(22)} color={tvc.muted}>{t('tv.loginWait')}</Txt>
          </View>
        </View>
        <View style={{ width: 2, backgroundColor: 'rgba(143,169,204,0.2)' }} />
        <View style={{ alignItems: 'center', gap: u(22) }}>
          <View style={{ padding: u(18), backgroundColor: '#fff', borderRadius: u(24) }}><QrCode value={s.url} size={u(264)} /></View>
          <Txt weight="bold" size={u(24)} color={tvc.text2} style={{ textAlign: 'center', maxWidth: u(300) }}>{t('tv.scan')}</Txt>
        </View>
      </View>
      <TvButton first label={t('tv.newCode')} icon="refresh-cw" onPress={() => setRound((n) => n + 1)} />
    </ScrollView>
  );
}
