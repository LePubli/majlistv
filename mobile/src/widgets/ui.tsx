// Widgets Android (étape 25) : dessin des six widgets (noir et or, textes en blanc pur, coins arrondis).
// Chaque widget existe en petit (2 × 2 cases) et en grand (4 × 2). Aucune logique ici : tout vient de widgets/model.ts.
import React from 'react';
import { FlexWidget, TextWidget, type ColorProp } from 'react-native-android-widget';
import type { CitationView, PrayerView, ReviseView } from './model';
import { WIDGET_LINKS } from './model';

const C = { bg: '#0B0906', panel: '#17120B', line: '#3A2E1E', gold: '#E6A739', goldLight: '#F2BE5C', goldDeep: '#3A2A10', text: '#FFFFFF', muted: '#B8AC98', dim: '#7D715F', onGold: '#120D06', arabic: '#F2D79A' } as const;

type Link = keyof typeof WIDGET_LINKS;
const root = (link: Link, label: string, children: React.ReactNode, padding = 14) => (
  <FlexWidget
    clickAction="OPEN_URI" clickActionData={{ uri: WIDGET_LINKS[link] }} accessibilityLabel={label}
    style={{ width: 'match_parent', height: 'match_parent', backgroundColor: C.bg, borderRadius: 22, borderWidth: 1, borderColor: C.line, padding, flexDirection: 'column', justifyContent: 'space-between' }}
  >
    {children}
  </FlexWidget>
);
const T = (text: string, size: number, color: ColorProp, weight: 'normal' | 'bold' | '800' = 'normal', extra: Record<string, unknown> = {}) => (
  <TextWidget text={text} style={{ fontSize: size, color, fontWeight: weight, ...extra }} />
);
const pill = (label: string) => (
  <FlexWidget style={{ backgroundColor: C.gold, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' }}>
    <TextWidget text={label} style={{ fontSize: 13, fontWeight: 'bold', color: C.onGold }} />
  </FlexWidget>
);

// ---------- Prière ----------
export function PrayerSmall({ v }: { v: PrayerView }) {
  if (v.kind === 'off') return root('prayer', v.message, <FlexWidget style={{ flex: 1, width: 'match_parent', alignItems: 'center', justifyContent: 'center' }}>{T(v.message, 14, C.text, 'bold', { textAlign: 'center' })}</FlexWidget>);
  return root('prayer', `${v.label} : ${v.next.name} ${v.next.time}`, (
    <>
      {T(v.label, 11, C.muted)}
      <FlexWidget style={{ flexDirection: 'column' }}>
        {T(v.next.name, 18, C.goldLight, 'bold')}
        {T(v.next.time, 36, C.text, 'bold')}
      </FlexWidget>
      {T(v.place, 11, C.muted)}
    </>
  ));
}

export function PrayerLarge({ v }: { v: PrayerView }) {
  if (v.kind === 'off') return root('prayer', v.message, <FlexWidget style={{ flex: 1, width: 'match_parent', alignItems: 'center', justifyContent: 'center' }}>{T(v.message, 15, C.text, 'bold', { textAlign: 'center' })}</FlexWidget>);
  return root('prayer', `${v.label} : ${v.next.name} ${v.next.time}`, (
    <>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        {T(`${v.label} · ${v.next.name}`, 13, C.goldLight, 'bold')}
        {T(v.place, 11, C.muted)}
      </FlexWidget>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', flexGap: 6 }}>
        {v.rows.map((r) => (
          <FlexWidget key={r.id} style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 14, backgroundColor: r.next ? C.goldDeep : C.panel, borderWidth: 1, borderColor: r.next ? C.gold : C.line }}>
            {T(r.name, 11, r.next ? C.goldLight : r.past ? C.dim : C.muted, r.next ? 'bold' : 'normal')}
            {T(r.time, 16, r.next ? C.text : r.past ? C.dim : C.text, 'bold')}
          </FlexWidget>
        ))}
      </FlexWidget>
    </>
  ));
}

// ---------- Réviser ----------
export function ReviseSmall({ v }: { v: ReviseView }) {
  const plain = v.kind !== 'ok' && v.kind !== 'none';
  return root('revise', v.label, plain ? (
    <>
      {T('Mejliss TV', 11, C.muted)}
      {T(v.label, 14, C.text, 'bold')}
      {pill(v.action)}
    </>
  ) : (
    <>
      {T('Mejliss TV', 11, C.muted)}
      <FlexWidget style={{ flexDirection: 'column' }}>
        {T(v.number, 44, C.gold, '800')}
        {T(v.kind === 'none' ? v.label : v.label.replace(v.number, '').trim() || v.label, 13, C.text, 'bold')}
      </FlexWidget>
      {T(v.week || ' ', 11, C.muted)}
    </>
  ));
}

export function ReviseLarge({ v }: { v: ReviseView }) {
  const plain = v.kind !== 'ok' && v.kind !== 'none';
  return root('revise', v.label, (
    <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexGap: 14 }}>
      <FlexWidget style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 110 }}>
        {plain ? T(v.label, 14, C.text, 'bold', { textAlign: 'center' }) : (
          <>
            {T(v.number, 46, C.gold, '800')}
            {T(v.kind === 'none' ? v.label : v.label.replace(v.number, '').trim() || v.label, 12, C.text, 'bold', { textAlign: 'center' })}
          </>
        )}
      </FlexWidget>
      <FlexWidget style={{ flex: 1, flexDirection: 'column', justifyContent: 'space-between', height: 'match_parent' }}>
        <FlexWidget style={{ flexDirection: 'column', flexGap: 4 }}>
          {v.titles.map((t, i) => <TextWidget key={i} text={`• ${t}`} maxLines={2} truncate="END" style={{ fontSize: 13, color: C.text }} />)}
          {v.week ? T(v.week, 11, C.muted) : null}
        </FlexWidget>
        {pill(v.action)}
      </FlexWidget>
    </FlexWidget>
  ), 12);
}

// ---------- Citation du jour ----------
export function CitationSmall({ v }: { v: CitationView }) {
  return root('citation', `${v.title} : ${v.text}`, (
    <>
      {T(`✦ ${v.title}`, 11, C.goldLight, 'bold')}
      <TextWidget text={v.kind === 'ok' ? `« ${v.text} »` : v.text} maxLines={6} truncate="END" style={{ fontSize: 13, color: C.text }} />
      {T(v.attribution || ' ', 10, C.muted)}
    </>
  ), 12);
}

export function CitationLarge({ v }: { v: CitationView }) {
  return root('citation', `${v.title} : ${v.text}`, (
    <>
      {T(`✦ ${v.title}`, 12, C.goldLight, 'bold')}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', alignItems: 'center', flexGap: 4 }}>
        {v.textAr ? <TextWidget text={v.textAr} maxLines={2} truncate="END" style={{ fontSize: 17, color: C.arabic, textAlign: 'center', width: 'match_parent' }} /> : null}
        <TextWidget text={v.kind === 'ok' ? `« ${v.text} »` : v.text} maxLines={v.textAr ? 3 : 5} truncate="END" style={{ fontSize: 13, color: C.text, textAlign: 'center', width: 'match_parent' }} />
      </FlexWidget>
      {T(v.attribution || ' ', 11, C.muted)}
    </>
  ), 12);
}
