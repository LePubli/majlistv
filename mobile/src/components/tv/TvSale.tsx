// Étape C-3 — contenu payant à l'unité sur la télé : prix (prix abonné), QR code de la fiche sur le site (paiement sur le téléphone,
// même compte) ; la fiche est relue toutes les 10 s tant que l'écran est ouvert : l'accès s'ouvre dès que le paiement est confirmé.
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useSession } from '@/lib/session';
import { SITE_URL } from '@/lib/config';
import { rentUnit, saleMoney, salePageUrl, type Sale } from '@/lib/sales';
import { tvc, useTv } from '@/lib/tvTheme';
import { Txt } from '@/components/ui';
import { QrCode } from './QrCode';

export const TV_SALE_POLL_MS = 10_000;

export function TvSale({ kind, id, sale, onRefresh }: { kind: 'talk' | 'audyn'; id: string; sale: Sale; onRefresh: () => void }) {
  const { t, locale, user } = useSession();
  useEffect(() => {
    if (!user) return undefined;
    const h = setInterval(onRefresh, TV_SALE_POLL_MS);
    return () => clearInterval(h);
  }, [user, onRefresh]);
  const money = (c: number) => saleMoney(c, sale.currency, locale);
  const dur = (h: number) => { const r = rentUnit(h); return r.unit === 'days' ? t('sale.days', { n: r.n }) : t('sale.hours', { n: r.n }); };
  const url = salePageUrl(SITE_URL, kind, id);
  const { u } = useTv();
  return (
    <View style={{ flexDirection: 'row', gap: u(34), alignItems: 'center', padding: u(28), borderRadius: u(26), backgroundColor: 'rgba(13,30,53,0.92)', borderWidth: 1, borderColor: 'rgba(143,169,204,0.25)' }}>
      <View style={{ padding: u(14), backgroundColor: '#fff', borderRadius: u(16) }}><QrCode value={url} size={u(200)} /></View>
      <View style={{ flex: 1, gap: u(10) }}>
        <Txt weight="extrabold" size={u(30)} color={tvc.text}>{t('sale.title')}</Txt>
        {sale.buy ? <Txt size={u(24)} color={tvc.text2}>{t('sale.buy')} : <Txt weight="extrabold" size={u(24)} color={tvc.accentLight}>{money(sale.buy.yourPrice)}</Txt></Txt> : null}
        {sale.rent ? <Txt size={u(24)} color={tvc.text2}>{t('sale.rent', { d: dur(sale.rent.hours) })} : <Txt weight="extrabold" size={u(24)} color={tvc.accentLight}>{money(sale.rent.yourPrice)}</Txt></Txt> : null}
        {sale.member && sale.memberDiscountPct > 0 ? <Txt size={u(20)} color={tvc.muted}>{t('sale.memberApplied', { n: sale.memberDiscountPct })}</Txt> : null}
        <Txt size={u(21)} color={tvc.muted} style={{ lineHeight: u(30) }}>{user ? t('tv.saleScan') : t('tv.saleLogin')}</Txt>
      </View>
    </View>
  );
}
