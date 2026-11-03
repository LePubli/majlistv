// M1 : bloc « Aujourd'hui » (textes, compteur, écran ouvert) et thème « Nuit et or ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayCount, todayKey, todayLabel, todayTarget, type TodayItem } from '../src/lib/today';
import { translate, APP_DICT, DICT } from '../src/lib/i18n';
import { applySkin, colors, currentSkin, fontFamily, fonts, gradientFor, pickSkin, veil } from '../src/lib/theme';

const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate('fr', k, v);
const it = (x: Partial<TodayItem>): TodayItem => ({ kind: 'cards', order: 1, done: false, href: '/learning', ...x });

test('todayLabel : une ligne par sorte, textes du site', () => {
  assert.equal(todayLabel(it({ kind: 'quranJuz', juz: 7 }), t), 'Lire le juz 7');
  assert.match(todayLabel(it({ kind: 'quranStart' }), t), /Coran/);
  assert.equal(todayLabel(it({ kind: 'athkar', moment: 'morning' }), t), 'Athkar du matin');
  assert.equal(todayLabel(it({ kind: 'athkar', moment: 'evening' }), t), 'Athkar du soir');
  assert.match(todayLabel(it({ kind: 'ramadan', day: 12 }), t), /12/);
  assert.match(todayLabel(it({ kind: 'ramadanBilan', year: 2027 }), t), /2027/);
  assert.equal(todayLabel(it({ kind: 'cards' }), t), 'Cartes à revoir');
  assert.equal(todayLabel(it({ kind: 'cards', done: true }), t), 'Cartes du jour revues');
  assert.equal(todayLabel(it({ kind: 'revision' }), t), 'Conférences à réviser');
  assert.equal(todayLabel(it({ kind: 'inconnu' }), t), '');
});

test('todayLabel : traduit en anglais et en arabe', () => {
  for (const l of ['en', 'ar'] as const) {
    const s = todayLabel(it({ kind: 'quranJuz', juz: 3 }), (k, v) => translate(l, k, v));
    assert.ok(s.includes('3') && s !== 'Lire le juz 3', l + ' : ' + s);
  }
});

test('todayCount et todayKey', () => {
  assert.equal(todayCount(it({ n: 3, total: 8 })), '3 / 8');
  assert.equal(todayCount(it({ n: 12 })), '12');
  assert.equal(todayCount(it({ n: 0 })), '');
  assert.equal(todayKey(it({ kind: 'athkar', moment: 'evening' })), 'athkar-evening');
  assert.equal(todayKey(it({ kind: 'quranJuz', juz: 4 })), 'quranJuz-4');
});

test('todayTarget : écran de l\'application ou page du site, jamais d\'adresse extérieure', () => {
  assert.deepEqual(todayTarget('/learning?tab=rev'), { app: '/learn' });
  assert.deepEqual(todayTarget('/learning'), { app: '/learn' });
  assert.deepEqual(todayTarget('/coran'), { app: '/quran' });
  assert.deepEqual(todayTarget('/learning?tab=athkar'), { app: '/athkar' });
  assert.deepEqual(todayTarget('/learning?tab=athkar', 'evening'), { app: '/athkar?cat=evening' });
  assert.deepEqual(todayTarget('/learning?tab=cards'), { web: '/learning?tab=cards' });
  assert.deepEqual(todayTarget('/ramadan#rb-t'), { web: '/ramadan#rb-t' });
  for (const bad of [undefined, 42, '', 'https://evil.example', '//evil.example', 'javascript:alert(1)', '/a b']) assert.deepEqual(todayTarget(bad), { app: '/learn' }, String(bad));
});

test('les textes td*, wl* et du thème existent dans les trois langues', () => {
  const keys = ['tdTitle', 'tdLeft', 'tdAllDone', 'tdQuranJuz', 'tdQuranStart', 'tdAthkar_morning', 'tdAthkar_evening', 'tdRamadan', 'tdRamadanBilan', 'tdCards', 'tdCardsDone', 'tdRevision', 'tdDone', 'tdTodo', 'tdAria',
    'wlTab', 'wlRow', 'wlAdd', 'wlRemove', 'wlAdded', 'wlRemoved', 'wlIntro'] as const;
  for (const l of ['fr', 'en', 'ar'] as const) for (const k of keys) assert.ok((DICT[l] as Record<string, string>)[k], `${l}.${k}`);
  for (const l of ['fr', 'en', 'ar'] as const) for (const k of ['skin.title', 'skin.site', 'skin.classique', 'skin.nuit', 'wl.full', 'wl.empty', 'today.web'] as const) assert.ok(APP_DICT[l][k], `${l}.${k}`);
});

test('thème : classique par défaut, « Nuit et or » sur demande, retour possible', () => {
  assert.equal(pickSkin('nuit'), 'nuit');
  assert.equal(pickSkin('autre'), 'classique');
  assert.equal(pickSkin(undefined), 'classique');
  assert.equal(currentSkin(), 'classique');
  assert.equal(colors.bg, '#0B0906');
  assert.equal(fontFamily('extrabold', 24, false), 'Montserrat_800ExtraBold');
  assert.equal(applySkin('classique'), false, 'déjà appliqué : rien ne change');
  assert.equal(applySkin('nuit'), true);
  assert.equal(colors.bg, '#0E1430');
  assert.equal(colors.panel, '#131B3D');
  assert.equal(colors.gold, '#E6A739');
  assert.equal(colors.text, '#FFFFFF', 'texte toujours en blanc pur');
  assert.equal(fonts.extrabold, 'Marcellus_400Regular');
  assert.equal(fontFamily('extrabold', 24, false), 'Marcellus_400Regular');
  assert.equal(fontFamily('bold', 20, true), 'Amiri_700Bold');
  assert.equal(fontFamily('regular', 14, false), 'DMSans_400Regular', 'le texte courant garde DM Sans');
  assert.equal(veil(0.5), 'rgba(14,20,48,0.5)');
  assert.ok(gradientFor('abc')[0].startsWith('#'));
  assert.equal(applySkin('classique'), true);
  assert.equal(colors.bg, '#0B0906');
  assert.equal(fonts.extrabold, 'Montserrat_800ExtraBold');
  assert.equal(veil(0.5), 'rgba(11,9,6,0.5)');
});

test('thème : les styles partagés suivent le thème (accesseurs)', async () => {
  const { readFileSync } = await import('node:fs');
  const ui = readFileSync(new URL('../src/components/ui.tsx', import.meta.url), 'utf8');
  assert.match(ui, /screenStyle: ViewStyle = \{ flex: 1, get backgroundColor\(\)/);
  // Plus aucune couleur de fond « noir chaud » écrite en dur hors espace enfant, intro et widget.
  const { readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = new URL('../src', import.meta.url).pathname;
  const bad: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!/kids|widgets/.test(f)) walk(p); } else if (/\.tsx$/.test(f) && !/LogoIntro/.test(f) && /rgba\(11,\s?9,\s?6|rgba\(5,\s?4,\s?3/.test(readFileSync(p, 'utf8'))) bad.push(p); } };
  walk(root);
  assert.deepEqual(bad, []);
});
