// Étape M6 — Compte : parrainage (étape 43) et cartes cadeaux (étape 21), comme « Mon compte » du site.
//  - Parrainage : lien personnel (partage par la feuille du téléphone, dont WhatsApp), code, compteurs, règle ; saisie du code
//    d'un parrain pour un compte tout neuf (48 h, comme le site).
//  - Cartes cadeaux : mes cartes achetées (code, état, partage du code ou du lien d'activation), activation d'une carte reçue.
//    L'ACHAT se fait sur le site (rien ne se vend dans l'application).
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Share, TextInput, View } from 'react-native';
import { useSession } from '@/lib/session';
import { SITE_URL } from '@/lib/config';
import { ApiError } from '@/lib/api';
import { GIFT_MONTHS, GIFT_STATE, cleanCode, codeOk, giftCode, redeemLink, referralLink, type Gift, type Referral } from '@/lib/onboarding';
import { colors, fonts, radius } from '@/lib/theme';
import { Button, Txt } from '../ui';

const box = () => ({ padding: 16, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, gap: 10 });
const eyebrow = { letterSpacing: 0.8, textTransform: 'uppercase' as const };
const input = (rtl: boolean) => ({ minHeight: 48, paddingHorizontal: 14, borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel2, color: colors.text, fontFamily: fonts.medium, fontSize: 15, textAlign: (rtl ? 'right' : 'left') as 'right' | 'left' });

export function ReferralBox() {
  const { api, t, config } = useSession();
  const [d, setD] = useState<Referral | null>(null);
  const [failed, setFailed] = useState(false);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => api.get<Referral>('/me/referral').then((r) => { setD(r); setFailed(false); }).catch(() => setFailed(true)), [api]);
  useEffect(() => { void load(); }, [load]);
  if (failed) return <View style={box()}><Txt size={13} color={colors.muted}>{t('errGeneric')}</Txt></View>;
  if (!d) return null;
  const n = (x: number) => `${x} ${x === 1 ? t('refMonth') : t('refMonths')}`;
  const link = referralLink(SITE_URL, d.code);
  async function claim() {
    setMsg(null);
    try { await api.post('/me/referral/claim', { code: cleanCode(code) }); setMsg({ ok: true, text: t('refInvited') }); setCode(''); await load(); }
    catch (e) { setMsg({ ok: false, text: e instanceof ApiError ? e.message : t('errGeneric') }); }
  }
  const stat = (v: number, label: string) => (
    <View style={{ flexGrow: 1, flexBasis: '45%', padding: 10, gap: 2, borderRadius: radius.card, backgroundColor: colors.panel2 }}>
      <Txt weight="extrabold" size={20} color={colors.goldLight}>{v}</Txt>
      <Txt size={12} color={colors.text2}>{label}</Txt>
    </View>
  );
  return (
    <View style={box()}>
      <Txt weight="bold" size={12} color={colors.muted} style={eyebrow}>{t('refTab')}</Txt>
      <Txt weight="extrabold" size={17}>{t('refTitle')}</Txt>
      <Txt size={14} color={colors.text2}>{t('refIntro', { n: n(d.months) })}</Txt>
      <Txt size={12} color={colors.muted}>{t('refLink')}</Txt>
      <Txt size={13} selectable style={{ writingDirection: 'ltr', padding: 10, borderRadius: radius.input, backgroundColor: colors.panel2 }}>{link}</Txt>
      {/* Partage : feuille du téléphone (WhatsApp, SMS, e-mail, copier…). */}
      <Button label={t('shareBtn')} onPress={() => { void Share.share({ message: `${t('refShareText')} ${link}` }).catch(() => {}); }} />
      <Txt size={12} color={colors.muted}>{t('refCode')} : <Txt size={12} weight="bold" selectable style={{ writingDirection: 'ltr' }}>{d.code}</Txt></Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {stat(d.stats.invited, t('refInvited2'))}{stat(d.stats.rewarded, t('refRewarded'))}{stat(d.stats.pending, t('refPending'))}{stat(d.stats.monthsEarned, t('refEarned'))}
      </View>
      {d.stats.capReached ? <Txt size={12} color={colors.muted}>{t('refCap', { n: d.maxPerYear })}</Txt> : null}
      {d.referredBy ? <Txt size={12} color={colors.ok}>{t('refYou', { app: config?.appName || 'Mejliss TV' })}</Txt> : (
        // Compte tout neuf invité par un proche : saisie du code (le serveur refuse au-delà de 48 h ou pour un ancien abonné).
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput value={code} onChangeText={(v) => setCode(cleanCode(v))} autoCapitalize="characters" autoCorrect={false} maxLength={10} placeholder="ABCD2345"
            placeholderTextColor={colors.muted} accessibilityLabel={t('refCode')} style={[input(false), { flex: 1, writingDirection: 'ltr' }]} />
          <Button label={t('submit')} variant="dark" disabled={!codeOk(code)} onPress={() => { void claim(); }} />
        </View>
      )}
      {msg ? <Txt size={13} color={msg.ok ? colors.ok : colors.danger} accessibilityRole="alert">{msg.text}</Txt> : null}
      <Txt size={12} color={colors.muted}>{t('refRules')}</Txt>
    </View>
  );
}

export function GiftsBox() {
  const { api, t, locale, isRTL } = useSession();
  const [list, setList] = useState<Gift[] | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get<Gift[]>('/me/gifts').then(setList).catch(() => setList([])), [api]);
  useEffect(() => { void load(); }, [load]);
  const date = (d: string) => { try { return new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; } };
  async function redeem() {
    const c = giftCode(code); if (!c) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api.post<{ months: number; premiumUntil: string; hasSubscription: boolean }>('/gifts/redeem', { code: c });
      setMsg({ ok: true, text: `${t('rdOk', { date: date(r.premiumUntil) })}${r.hasSubscription ? ` ${t('rdSub')}` : ''}` }); setCode('');
    } catch (e) { setMsg({ ok: false, text: e instanceof ApiError ? e.message : t('errGeneric') }); } finally { setBusy(false); }
  }
  return (
    <View style={box()}>
      <Txt weight="bold" size={12} color={colors.muted} style={eyebrow}>{t('gfAccount')}</Txt>
      {list && list.length === 0 ? <Txt size={13} color={colors.muted}>{t('gfNone')}</Txt> : null}
      {(list ?? []).map((g) => (
        <View key={g.id} style={{ gap: 6, padding: 12, borderRadius: radius.card, backgroundColor: colors.panel2, borderWidth: 1, borderColor: g.status === 'paid' ? colors.goldLine : colors.borderSoft }}>
          <Txt weight="bold">{t(GIFT_MONTHS[g.months] ?? 'gfM1')} · <Txt size={13} color={g.status === 'paid' ? colors.goldLight : colors.muted}>{t(GIFT_STATE[g.status])}</Txt></Txt>
          <Txt size={12} color={colors.muted}>{date(g.paidAt || g.createdAt)}</Txt>
          {g.recipientEmail ? <Txt size={12} color={colors.muted}>{t('gfSentTo', { to: g.recipientEmail })}</Txt> : null}
          {g.code && g.status === 'paid' ? (
            <>
              <Txt size={13}>{t('gfCode')} : <Txt size={13} weight="bold" selectable style={{ writingDirection: 'ltr' }}>{g.code}</Txt></Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button label={t('gfGiveLink')} variant="dark" onPress={() => { void Share.share({ message: `${redeemLink(SITE_URL, g.code as string)}` }).catch(() => {}); }} />
              </View>
            </>
          ) : null}
        </View>
      ))}
      <Button label={t('gfOffer')} variant="dark" onPress={() => { void Linking.openURL(`${SITE_URL}/gift`); }} />
      <Txt weight="bold" size={14}>{t('rdTitle')}</Txt>
      <Txt size={13} color={colors.text2}>{t('rdLead')}</Txt>
      <TextInput value={code} onChangeText={(v) => setCode(v.toUpperCase().slice(0, 16))} autoCapitalize="characters" autoCorrect={false} placeholder="ABCD-EFGH-JKLM"
        placeholderTextColor={colors.muted} accessibilityLabel={t('rdCode')} style={[input(isRTL), { writingDirection: 'ltr', textAlign: 'left' }]} />
      <Button label={t('rdBtn')} loading={busy} disabled={!giftCode(code)} onPress={() => { void redeem(); }} />
      {msg ? <Txt size={13} color={msg.ok ? colors.ok : colors.danger} accessibilityRole="alert">{msg.text}</Txt> : null}
    </View>
  );
}
