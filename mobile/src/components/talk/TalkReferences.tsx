// Fiche vidéo → « Références citées » : versets et hadiths validés, minute cliquable (ramène la vidéo au passage), texte de la SOURCE.
// Même contenu que le site (web/modules/references/TalkReferences.js). N'affiche rien sans référence validée.
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSession } from '@/lib/session';
import { formatClock } from '@/lib/format';
import { creditLine, hasNoText, showReferences, type PublicRef } from '@/lib/references';
import type { Talk } from '@/lib/types';
import { colors, radius } from '@/lib/theme';
import { Txt } from '../ui';

export function TalkReferences({ talk, onSeek }: { talk: Talk; onSeek: (ms: number) => void }) {
  const { t, api, isRTL, config } = useSession();
  const on = showReferences(talk, config?.features?.references !== false);
  const [list, setList] = useState<PublicRef[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!on) return undefined;
    let alive = true;
    api.get<{ references: PublicRef[] }>(`/talks/${talk.id}/references`).then((r) => { if (alive) setList(r.references); }).catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, [on, api, talk.id]);
  if (!on || !list || list.length === 0) return null;
  const side = { textAlign: isRTL ? 'right' : 'left' } as const;
  return (
    <View style={{ padding: 16, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, gap: 10 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Txt weight="extrabold" size={17} style={side}>{open ? '▾' : '▸'} {t('rfTitle')} <Txt size={13} color={colors.muted}>({t('rfCount', { n: list.length })})</Txt></Txt>
      </Pressable>
      {open ? list.map((r) => {
        const credit = creditLine(r, (g) => t('rfGrade', { g }));
        return (
          <View key={r.id} style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Txt weight="bold" style={side}>{r.unidentified ? t('rfUnidentified') : r.label}</Txt>
            {r.startMs != null ? (
              <Pressable accessibilityRole="button" onPress={() => onSeek(r.startMs as number)} hitSlop={6} style={{ minHeight: 40, justifyContent: 'center' }}>
                <Txt size={13} weight="bold" color={colors.goldLight} style={side}>{t('rfAt', { m: formatClock(r.startMs / 1000) })}</Txt>
              </Pressable>
            ) : null}
            {r.ar ? <Txt size={20} color={colors.goldLight} style={{ textAlign: 'right', writingDirection: 'rtl', lineHeight: 36 }}>{r.ar}</Txt> : null}
            {r.fr ? <Txt size={15} style={side}>{r.fr}</Txt> : null}
            {hasNoText(r) ? <Txt size={13} color={colors.muted} style={side}>{t('rfNoText')}</Txt> : null}
            {credit ? <Txt size={12} color={colors.muted} style={side}>{credit}</Txt> : null}
          </View>
        );
      }) : null}
      {open ? <Txt size={12} color={colors.muted} style={side}>{t('rfSource')}</Txt> : null}
    </View>
  );
}
