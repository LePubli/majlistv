// « Mes petites actions » (espace enfant) : le parent propose, l'enfant touche « Je l'ai fait », le parent valide depuis son espace.
// Utilisé sur l'accueil et à la fin d'un quiz.
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { KC, openActions } from '@/lib/kids';
import type { KidAction, KidActionCounts } from '@/lib/types';
import { KButton, KTxt } from '@/components/kids/KidUi';

type Props = { limit?: number; onlyOpen?: boolean; hideEmpty?: boolean; title?: string; onChange?: () => void };

export function KidActionsList({ limit = 100, onlyOpen = false, hideEmpty = false, title = '', onChange }: Props) {
  const { t } = useSession();
  const { kidApi, kid, epoch } = useKid();
  const [d, setD] = useState<{ actions: KidAction[]; counts: KidActionCounts } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => kidApi.get<{ actions: KidAction[]; counts: KidActionCounts }>('/kids/actions').then(setD).catch(() => { /* la liste reste telle quelle */ }), [kidApi]);
  useEffect(() => { void load(); }, [load, kid?.profile.id, epoch]);
  if (!d) return null;
  const list = onlyOpen ? openActions(d.actions, limit) : d.actions.slice(0, limit);
  if (hideEmpty && list.length === 0) return null;
  const claim = async (id: string) => {
    setBusy(id);
    try { await kidApi.post(`/kids/actions/${id}/claim`); await load(); onChange?.(); } catch { /* le parent verra l'action telle quelle */ } finally { setBusy(null); }
  };
  return (
    <View style={{ gap: 10 }}>
      {title ? <KTxt weight="extrabold" size={20} accessibilityRole="header">{title}</KTxt> : null}
      {list.length === 0 ? <KTxt color={KC.text2}>{t('kaNone')}</KTxt> : null}
      {list.map((a) => (
        <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, backgroundColor: KC.surface, borderWidth: 2, borderColor: a.status === 'validated' ? KC.ok : KC.line }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: a.status === 'validated' ? KC.ok : KC.surface2 }}>
            <KTxt weight="extrabold" size={16} color={a.status === 'validated' ? '#06210F' : KC.text2}>{a.status === 'validated' ? '✓' : a.status === 'claimed' ? '…' : ''}</KTxt>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <KTxt weight="extrabold" size={16}>{a.title}</KTxt>
            {a.status === 'claimed' ? <KTxt size={13} color={KC.text2}>{t('kaWait')}</KTxt> : null}
            {a.status === 'validated' ? <KTxt size={13} color={KC.ok}>{t('kaValidated')}</KTxt> : null}
          </View>
          {a.status === 'todo' ? <KButton label={t('kaDone')} variant="soft" loading={busy === a.id} onPress={() => void claim(a.id)} style={{ minHeight: 48, paddingHorizontal: 16 }} /> : null}
        </View>
      ))}
      {list.length > 0 ? <KTxt size={12} color={KC.muted}>{t('kaParentChecks')}</KTxt> : null}
    </View>
  );
}
