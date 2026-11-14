// Étape C-3 — contenu payant à l'unité sur la télé : prix (prix abonné), QR code de la fiche sur le site (paiement sur le téléphone,
// même compte) ; la fiche est relue toutes les 10 s tant que l'écran est ouvert : l'accès s'ouvre dès que le paiement est confirmé.
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useSession } from '@/lib/session';
import { SITE_URL } from '@/lib/config';
import { rentUnit, saleMoney, salePageUrl, type Sale } from '@/lib/sales';
import { colors } from '@/lib/theme';
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
  return (
    <View style={{ flexDirection: 'row', gap: 24, alignItems: 'center', padding: 18, borderRadius: 16, backgroundColor: colors.goldTint, borderWidth: 1, borderColor: colors.goldLine }}>
      <View style={{ padding: 8, backgroundColor: '#fff', borderRadius: 10 }}><QrCode value={url} size={150} /></View>
      <View style={{ flex: 1, gap: 6 }}>
        <Txt weight="extrabold" size={20} color={colors.goldLight}>{t('sale.title')}</Txt>
        {sale.buy ? <Txt size={16}>{t('sale.buy')} : <Txt weight="extrabold" size={16} color={colors.goldLight}>{money(sale.buy.yourPrice)}</Txt></Txt> : null}
        {sale.rent ? <Txt size={16}>{t('sale.rent', { d: dur(sale.rent.hours) })} : <Txt weight="extrabold" size={16} color={colors.goldLight}>{money(sale.rent.yourPrice)}</Txt></Txt> : null}
        {sale.member && sale.memberDiscountPct > 0 ? <Txt size={13} color={colors.muted}>{t('sale.memberApplied', { n: sale.memberDiscountPct })}</Txt> : null}
        <Txt size={14} color={colors.text2}>{user ? t('tv.saleScan') : t('tv.saleLogin')}</Txt>
      </View>
    </View>
  );
}
