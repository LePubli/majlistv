// Étape C-3 — contenu payant à l'unité dans l'application (vidéo, Audyn) :
//  - SaleCard : prix d'achat / de location (prix abonné), bouton « Acheter sur le site » (même compte) ; au retour dans l'application,
//    la fiche est relue : l'accès s'ouvre dès que Stripe a confirmé le paiement ;
//  - SalePill : « ✓ Acheté » ou « ⏳ Loué jusqu'au … » ;
//  - PurchasesBox : Mon compte → mes achats et locations.
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { SITE_URL } from '@/lib/config';
import { rentUnit, saleMoney, salePageUrl, type Purchase, type Sale } from '@/lib/sales';
import { colors, radius } from '@/lib/theme';
import { Button, Txt } from '@/components/ui';

export function useRentLabel() {
  const { t } = useSession();
  return (hours: number) => { const r = rentUnit(hours); return r.unit === 'days' ? t('sale.days', { n: r.n }) : t('sale.hours', { n: r.n }); };
}

export function SalePill({ sale, center }: { sale?: Sale | null; center?: boolean }) {
  const { t, locale } = useSession();
  if (!sale?.owned) return null;
  const until = sale.owned.expiresAt ? new Date(sale.owned.expiresAt).toLocaleString(locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <View style={{ alignSelf: center ? 'center' : 'flex-start', paddingVertical: 4, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.goldTint, borderWidth: 1, borderColor: colors.goldLine }}>
      <Txt weight="bold" size={13} color={colors.goldLight}>{sale.owned.mode === 'buy' ? `✓ ${t('sale.owned')}` : `⏳ ${t('sale.rentedUntil', { d: until })}`}</Txt>
    </View>
  );
}

export function SaleCard({ kind, id, sale, onRefresh }: { kind: 'talk' | 'audyn'; id: string; sale: Sale; onRefresh: () => void }) {
  const { t, locale, user } = useSession();
  const rentLabel = useRentLabel();
  const [opened, setOpened] = useState(false);
  // Retour dans l'application après le paiement sur le site : la fiche est relue (l'accès arrive avec la confirmation de Stripe).
  useEffect(() => {
    if (!opened) return undefined;
    const s = AppState.addEventListener('change', (st) => { if (st === 'active') onRefresh(); });
    return () => s.remove();
  }, [opened, onRefresh]);
  const money = (c: number) => saleMoney(c, sale.currency, locale);
  const row = (label: string, help: string, o: { price: number; yourPrice: number }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.card, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderSoft }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt weight="bold" size={15}>{label}</Txt>
        <Txt size={12} color={colors.muted}>{help}</Txt>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {o.yourPrice !== o.price ? <Txt size={12} color={colors.muted} style={{ textDecorationLine: 'line-through' }}>{money(o.price)}</Txt> : null}
        <Txt weight="extrabold" size={17} color={colors.goldLight}>{money(o.yourPrice)}</Txt>
      </View>
    </View>
  );
  const open = () => { setOpened(true); void Linking.openURL(salePageUrl(SITE_URL, kind, id)); };
  return (
    <View style={{ padding: 16, borderRadius: radius.panel, backgroundColor: colors.goldTint, borderWidth: 1, borderColor: colors.goldLine, gap: 10 }}>
      <Txt weight="extrabold" size={17} color={colors.goldLight}>{t('sale.title')}</Txt>
      <Txt size={14} color={colors.text2}>{t('sale.lead')}</Txt>
      {sale.buy ? row(t('sale.buy'), t('sale.buyHelp'), sale.buy) : null}
      {sale.rent ? row(t('sale.rent', { d: rentLabel(sale.rent.hours) }), t('sale.rentHelp', { d: rentLabel(sale.rent.hours) }), sale.rent) : null}
      {sale.member && sale.memberDiscountPct > 0 ? <Txt size={12} color={colors.muted}>{t('sale.memberApplied', { n: sale.memberDiscountPct })}</Txt> : null}
      {!sale.member && sale.memberDiscountPct > 0 ? <Txt size={12} color={colors.muted}>{t('sale.memberHint', { n: sale.memberDiscountPct })}</Txt> : null}
      {user ? (
        <>
          <Button label={t('sale.buyOnSite')} onPress={open} />
          <Txt size={12} color={colors.muted}>{t('sale.siteHelp')}</Txt>
          {opened ? <Button label={t('sale.refresh')} variant="dark" onPress={onRefresh} /> : null}
        </>
      ) : (
        <Button label={t('sale.login')} onPress={() => router.push('/login')} />
      )}
    </View>
  );
}

/** Mon compte → « Mes achats » (chargé à l'ouverture et au retour dans l'application). */
export function PurchasesSection() {
  const { api, t } = useSession();
  const [list, setList] = useState<Purchase[] | null>(null);
  const load = useCallback(() => api.get<Purchase[]>('/me/purchases').then(setList).catch(() => setList([])), [api]);
  useEffect(() => {
    void load();
    const s = AppState.addEventListener('change', (st) => { if (st === 'active') void load(); });
    return () => s.remove();
  }, [load]);
  return (
    <View style={{ padding: 16, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, gap: 10 }}>
      <Txt weight="bold" size={12} color={colors.muted} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>{t('sale.mine')}</Txt>
      {list ? <PurchasesBox list={list} /> : <Txt size={13} color={colors.muted}>…</Txt>}
    </View>
  );
}

export function PurchasesBox({ list }: { list: Purchase[] }) {
  const { t, locale } = useSession();
  if (!list.length) return <Txt size={13} color={colors.muted}>{t('sale.none')}</Txt>;
  const date = (d: string, time = false) => { try { return new Date(d).toLocaleString(locale, time ? { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; } };
  return (
    <View style={{ gap: 8 }}>
      {list.map((p) => {
        const state = p.status === 'refunded' ? t('sale.refunded') : p.mode === 'buy' ? t('sale.owned') : p.active && p.expiresAt ? t('sale.rentedUntil', { d: date(p.expiresAt, true) }) : t('sale.rentEnded');
        return (
          <Pressable key={p.id} accessibilityRole="link" disabled={!p.active}
            onPress={() => (p.kind === 'talk' ? router.push({ pathname: '/talk/[id]', params: { id: p.itemId } }) : router.push({ pathname: '/audyn/[id]', params: { id: p.itemId } }))}
            style={{ gap: 4, padding: 12, borderRadius: radius.card, backgroundColor: colors.panel2, borderWidth: 1, borderColor: p.active ? colors.goldLine : colors.borderSoft }}>
            <Txt weight="bold" numberOfLines={2}>{p.kind === 'talk' ? '🎬' : '🎧'} {p.title}</Txt>
            <Txt size={12} color={colors.muted}>{p.mode === 'buy' ? t('sale.buy') : t('sale.rentShort')} · {saleMoney(p.amount, p.currency, locale)}{p.paidAt ? ` · ${date(p.paidAt)}` : ''}</Txt>
            <Txt size={13} weight="bold" color={p.active ? colors.goldLight : colors.muted}>{state}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
