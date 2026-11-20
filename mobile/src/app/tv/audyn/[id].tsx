// Fiche Audyn sur la télé (refonte TV-R) : couverture, titre, auteur, description ; « Écouter » / « Reprendre » ; parties à droite
// (OK = écouter cette partie). La lecture continue en fond ; l'écran « En écoute » donne les commandes (pause, ±15 s, partie
// précédente / suivante). Aperçu seulement : message ; contenu à l'unité : prix et QR code (TvSale).
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { useAudyn } from '@/lib/audynPlayer';
import type { AudynDetail } from '@/lib/audyn';
import { tvc, useTv } from '@/lib/tvTheme';
import { ErrorBox, Loading, Txt } from '@/components/ui';
import { TvSale } from '@/components/tv/TvSale';
import { TvBookView } from '@/components/tv/TvBookView';
import { SalePill } from '@/components/SaleCard';

export default function TvAudynItem() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, t, user } = useSession();
  const au = useAudyn();
  const { u } = useTv();
  const d = useAsync(() => api.get<AudynDetail>(`/audyn/${id}`), [id, user?.id]);
  const [saved, setSaved] = useState<{ index: number; pos: number } | null>(null);
  useEffect(() => { if (d.data) void au.savedFor(d.data.id).then(setSaved); }, [d.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (d.loading && !d.data) return <View style={{ flex: 1, backgroundColor: tvc.bg }}><Loading /></View>;
  if (!d.data) return <View style={{ flex: 1, backgroundColor: tvc.bg }}><ErrorBox onRetry={d.reload} /></View>;
  const b = d.data;
  const go = async (fn: () => Promise<void>) => { await fn(); router.push('/tv/audyn/player'); };
  const extra = (
    <>
      <SalePill sale={b.sale} />
      {!b.access.full && b.sale ? <TvSale kind="audyn" id={b.id} sale={b.sale} onRefresh={d.reload} /> : !b.access.full ? <Txt size={u(22)} color={tvc.kids} style={{ lineHeight: u(32) }}>{t('tv.audynPreview')}</Txt> : null}
    </>
  );
  return (
    <TvBookView b={b} by={b.author || b.narrator} saved={!!saved} extra={extra}
      onListen={() => { void go(() => au.openResume(b)); }}
      onFromStart={() => { void go(() => au.open(b, 0, 0)); }}
      onChapter={(i) => { void go(() => au.open(b, i, 0)); }} />
  );
}
