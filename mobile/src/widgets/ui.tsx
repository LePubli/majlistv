// Widgets Android (étape 25) : dessin des six widgets (noir et or, textes en blanc pur, coins arrondis).
// Chaque widget existe en petit (2 × 2 cases) et en grand (4 × 2). Aucune logique ici : tout vient de widgets/model.ts.
// ATTENTION : la bibliothèque des widgets ne sait pas dessiner les « fragments » React (<>…</>) : on passe des listes d'éléments (kids).
import React from 'react';
import { FlexWidget, ImageWidget, TextWidget, type ColorProp } from 'react-native-android-widget';
import type { CitationView, PrayerView, ReviseView } from './model';
import { WIDGET_LINKS } from './model';
import { EMBLEM, WORDMARK } from './images';

// Étape 27b : « version B » — fond dégradé brun doré, accents or, grande heure, logo Mejliss TV.
const C = { bg: '#0B0906', bgTop: '#2E200A', panel: '#17120B', line: '#3A2E1E', border: '#4D3A16', gold: '#E6A739', goldLight: '#F7C863', goldDeep: '#3A2A10', text: '#FFFFFF', muted: '#B8AC98', dim: '#7D715F', onGold: '#120D06', arabic: '#F7D98F' } as const;

type Link = keyof typeof WIDGET_LINKS;
/** Liste d'enfants d'un widget (à la place d'un fragment). */
const kids = (...n: React.ReactNode[]) => n;
const root = (link: Link, label: string, children: React.ReactNode, padding = 16) => (
  <FlexWidget
    clickAction="OPEN_URI" clickActionData={{ uri: WIDGET_LINKS[link] }} accessibilityLabel={label}
    style={{
      width: 'match_parent', height: 'match_parent', backgroundColor: C.bg, backgroundGradient: { from: C.bgTop, to: C.bg, orientation: 'TL_BR' },
      borderRadius: 26, borderWidth: 1, borderColor: C.border, padding, flexDirection: 'column', justifyContent: 'space-between',
    }}
  >
    {children}
  </FlexWidget>
);
const T = (text: string, size: number, color: ColorProp, weight: 'normal' | 'bold' | '800' = 'normal', extra: Record<string, unknown> = {}) => (
  <TextWidget text={text} style={{ fontSize: size, color, fontWeight: weight, ...extra }} />
);
/** Logo : emblème seul (petit) ou emblème + nom (grand). */
const logo = (withName: boolean, h = 28) => (
  <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 7 }}>
    {kids(
      <ImageWidget image={EMBLEM} imageWidth={Math.round(h * 0.93)} imageHeight={h} />,
      withName ? <ImageWidget image={WORDMARK} imageWidth={Math.round(h * 0.6 * 4.86)} imageHeight={Math.round(h * 0.6)} /> : null,
    )}
  </FlexWidget>
);
/** Bouton plein or (le widget entier ouvre l'application). */
const pill = (label: string, wide = false, size = 14) => (
  <FlexWidget style={{ width: wide ? 'match_parent' : 'wrap_content', backgroundColor: C.gold, borderRadius: 20, paddingHorizontal: 16, paddingVertical: wide ? 10 : 7, alignItems: 'center', justifyContent: 'center' }}>
    <TextWidget text={label} style={{ fontSize: size, fontWeight: 'bold', color: C.onGold, textAlign: 'center' }} />
  </FlexWidget>
);
const message = (text: string, size: number) => (
  <FlexWidget style={{ flex: 1, width: 'match_parent', alignItems: 'center', justifyContent: 'center' }}>{T(text, size, C.text, 'bold', { textAlign: 'center' })}</FlexWidget>
);

/** Widget de secours si le dessin normal échoue : jamais de widget vide. */
export function Fallback({ text }: { text: string }) {
  return root('citation', text, message(text, 13), 12);
}

// ---------- Prière ----------
export function PrayerSmall({ v }: { v: PrayerView }) {
  if (v.kind === 'off') return root('prayer', v.message, kids(logo(false, 24), message(v.message, 13)));
  const foot = [v.next.id !== 'sunrise' && v.sun ? `${v.sun.name} ${v.sun.time}` : '', v.place].filter(Boolean).join(' · ');
  return root('prayer', `${v.label} : ${v.next.name} ${v.next.time}`, kids(
    <FlexWidget style={{ flexDirection: 'column', flexGap: 6 }}>{kids(logo(false, 24), T(v.label.toUpperCase(), 9, C.muted))}</FlexWidget>,
    <FlexWidget style={{ flexDirection: 'column' }}>{kids(T(v.next.name, 22, C.text, 'bold'), T(v.next.time, 38, C.goldLight, '800'))}</FlexWidget>,
    <TextWidget text={foot || ' '} maxLines={1} truncate="END" style={{ fontSize: 10, color: C.muted }} />,
  ), 14);
}

export function PrayerLarge({ v }: { v: PrayerView }) {
  if (v.kind === 'off') return root('prayer', v.message, kids(logo(true, 28), message(v.message, 15)));
  const sub = [v.place, v.date].filter(Boolean).join(' · ');
  return root('prayer', `${v.label} : ${v.next.name} ${v.next.time}`, kids(
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      {kids(
        <FlexWidget style={{ flexDirection: 'column', flexGap: 6 }}>{kids(logo(true, 28), T(v.label.toUpperCase(), 10, C.muted), T(v.next.name, 28, C.text, 'bold'))}</FlexWidget>,
        <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end' }}>{kids(T(v.next.time, 48, C.goldLight, '800'), <TextWidget text={sub || ' '} maxLines={1} truncate="END" style={{ fontSize: 11, color: C.muted }} />)}</FlexWidget>,
      )}
    </FlexWidget>,
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', flexGap: 8 }}>
      {kids(
        <FlexWidget style={{ width: 'match_parent', height: 1, backgroundColor: C.line }} />,
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between' }}>
          {v.rows.map((r) => (
            <FlexWidget key={r.id} style={{ flex: 1, alignItems: 'center' }}>
              {kids(
                T(r.name, 11, r.next ? C.goldLight : r.sun ? C.dim : r.past ? C.dim : C.muted, r.next ? 'bold' : 'normal'),
                T(r.time, 13, r.next ? C.goldLight : r.past || r.sun ? C.muted : C.text, 'bold'),
              )}
            </FlexWidget>
          ))}
        </FlexWidget>,
      )}
    </FlexWidget>,
  ));
}

// ---------- Réviser ----------
export function ReviseSmall({ v }: { v: ReviseView }) {
  const plain = v.kind !== 'ok' && v.kind !== 'none';
  return root('revise', v.label, plain
    ? kids(logo(false, 24), T(v.label, 14, C.text, 'bold'), pill(v.action, true, 12))
    : kids(
      logo(false, 24),
      <FlexWidget style={{ flexDirection: 'column' }}>{kids(T(v.number, 52, C.goldLight, '800'), T(v.kind === 'none' ? v.label : v.today, 12, C.text, 'bold'))}</FlexWidget>,
      v.kind === 'none' ? T(v.week || ' ', 10, C.muted) : pill(v.actionGo, true, 12),
    ), 14);
}

export function ReviseLarge({ v }: { v: ReviseView }) {
  const plain = v.kind !== 'ok' && v.kind !== 'none';
  const head = plain
    ? kids(logo(true, 28), T(v.label, 16, C.text, 'bold'))
    : kids(
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 14 }}>
        {kids(
          T(v.number, 60, C.goldLight, '800'),
          <FlexWidget style={{ flex: 1, flexDirection: 'column', flexGap: 3 }}>
            {kids(
              T(v.kind === 'none' ? v.label : v.today, 17, C.text, 'bold'),
              ...v.titles.map((t, i) => <TextWidget key={i} text={t} maxLines={1} truncate="END" style={{ fontSize: 12, color: C.muted }} />),
              v.week ? T(v.week, 11, C.dim) : null,
            )}
          </FlexWidget>,
        )}
      </FlexWidget>,
    );
  return root('revise', v.label, kids(
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', flexGap: 6 }}>{plain ? head : kids(logo(true, 22), ...head)}</FlexWidget>,
    pill(plain ? v.action : v.actionNow, true, 14),
  ));
}

// ---------- Citation du jour ----------
export function CitationSmall({ v }: { v: CitationView }) {
  return root('citation', `${v.title} : ${v.text}`, kids(
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 6 }}>{kids(logo(false, 22), T(v.title, 10, C.goldLight, 'bold'))}</FlexWidget>,
    <TextWidget text={v.kind === 'ok' ? `« ${v.text} »` : v.text} maxLines={5} truncate="END" style={{ fontSize: 13, color: C.text }} />,
    <TextWidget text={v.attribution ? `— ${v.attribution}` : ' '} maxLines={1} truncate="END" style={{ fontSize: 10, color: C.goldLight }} />,
  ), 14);
}

export function CitationLarge({ v }: { v: CitationView }) {
  return root('citation', `${v.title} : ${v.text}`, kids(
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      {kids(logo(true, 24), T(v.title, 11, C.goldLight, 'bold'))}
    </FlexWidget>,
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', alignItems: 'center', flexGap: 5 }}>
      {kids(
        v.textAr ? <TextWidget text={v.textAr} maxLines={2} truncate="END" style={{ fontSize: 19, color: C.arabic, textAlign: 'center', width: 'match_parent' }} /> : null,
        <TextWidget text={v.kind === 'ok' ? v.text : v.text} maxLines={v.textAr ? 3 : 5} truncate="END" style={{ fontSize: 13, color: C.text, textAlign: 'center', width: 'match_parent' }} />,
      )}
    </FlexWidget>,
    <TextWidget text={v.attribution ? `— ${v.attribution}` : ' '} maxLines={1} truncate="END" style={{ fontSize: 11, color: C.goldLight, textAlign: 'center', width: 'match_parent' }} />,
  ));
}
