// Étape N2 (15/11) — Apprendre en 3 onglets sans sous-onglets (Aujourd'hui · Réviser · Mes progrès), phrase d'explication,
// anciennes adresses (?tab=dash|plan|path|att|commit|bilan|cards|quran|athkar) conservées. (Remplace le test de l'étape B6.)
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const lp = read('app/(module-learning)/learning/page.js');

// Trois onglets, « Réviser » seulement si une de ses fonctions est active ; plus de sous-onglets
assert.match(lp, /\{ id: 'today', label: t\('lgGToday'\), intro: 'lgTTodayTx' \}/);
assert.match(lp, /\.\.\.\(hasRev \? \[\{ id: 'rev', label: <>\{t\('lgTRev'\)\}/);
assert.match(lp, /const hasRev = feat\('revision'\) \|\| feat\('memorycards'\) \|\| feat\('quiz'\);/);
assert.match(lp, /\{ id: 'progress', label: t\('lgGProgress'\), intro: 'lgTProgTx' \}/);
assert.match(lp, /<TabBar tabs=\{tabs\} current=\{tab\} onChange=\{go\}/);
assert.doesNotMatch(lp, /lg-subtabs|GROUPS|subTabs/, 'plus de sous-onglets');
for (const id of ['today', 'rev', 'progress']) assert.match(lp, new RegExp(`<TabPanel id="${id}" current=\\{tab\\}>`));
assert.equal((lp.match(/<TabPanel id=/g) || []).length, 3, 'exactement trois panneaux');

// Anciennes adresses
assert.match(lp, /export const LEGACY_TABS = \{\n  dash: \['today'\], plan: \['today', 'week'\], path: \['progress', 'series'\], att: \['progress', 'series'\],\n  commit: \['progress', 'commit'\], bilan: \['progress', 'bilan'\], cards: \['rev', 'cards'\],\n\};/);
assert.match(lp, /if \(oldTab === 'quran'\) router\.replace\('\/coran'\);\n\s*else if \(oldTab === 'athkar'\) router\.replace\('\/adhkar'\);\n\s*else if \(to\) router\.replace\(`\/learning\?tab=\$\{to\[0\]\}\$\{to\[1\] \? `&s=\$\{to\[1\]\}` : ''\}`, \{ scroll: false \}\);/);
assert.match(lp, /document\.getElementById\(`lg-\$\{sec\}`\)\?\.scrollIntoView/, 'descente vers la section demandée');
for (const id of ['week', 'quiz', 'revision', 'cards', 'series', 'commit', 'bilan', 'stats']) assert.match(lp, new RegExp(`id="lg-${id}"`), `section lg-${id}`);

// Aujourd'hui : planning repliable ; Mes progrès : sommaire
assert.match(lp, /aria-expanded=\{week\} aria-controls="lg-week-body" onClick=\{\(\) => setWeek\(\(w\) => !w\)\}/);
assert.match(lp, /\{week && <div id="lg-week-body"><PlanningClient \/><\/div>\}/);
assert.match(lp, /useEffect\(\(\) => \{ if \(sec === 'week'\) setWeek\(true\); \}, \[sec\]\);/, '?tab=plan ouvre le planning');
assert.match(lp, /<nav className="lg-jump" aria-label=\{t\('lgJump'\)\}>/);
assert.match(lp, /<h2>\{t\('lgSeriesAtt'\)\}<\/h2>/, 'séries et attestations en une seule liste');
assert.doesNotMatch(lp, /lg-steps|lg-three|lgYourLearning|lg-bilan-g/, 'doublons du tableau de bord retirés');

// Phrase d'explication par onglet, masquée après « Compris »
assert.match(lp, /<GroupIntro id=\{`n2-\$\{tab\}`\} text=\{t\(tabNow\.intro\)\} t=\{t\} \/>/);
assert.match(lp, /localStorage\.setItem\(key, '1'\)/); assert.match(lp, /catch \{ setSeen\(false\); \}/);

// Textes fr / en / ar
const i18n = read('lib/i18n.js');
for (const k of ['lgGToday', 'lgTRev', 'lgGProgress', 'lgTTodayTx', 'lgTRevTx', 'lgTProgTx', 'lgWeek', 'lgWeekHide', 'lgQuizTodo', 'lgQuizGo', 'lgQuizMore', 'lgCommitNow', 'lgSeriesAtt', 'lgJump', 'lgStats', 'lgGotIt'])
  assert.equal((i18n.match(new RegExp(`^    ${k}:`, 'gm')) || []).length, 3, `${k} en fr/en/ar`);

// Menus et liens
const nav = read('lib/navcfg.js');
assert.match(nav, /space: \[\['learning', 'Aujourd’hui'\], \['quiz', 'Réviser'\], \['progress', 'Mes progrès'\], \['practice', 'Mes engagements', true\], \['bilan', 'Mon bilan', true\]/);
const ms = read('components/MemberShell.js');
assert.match(ms, /progress: \{ key: 'progress', href: '\/learning\?tab=progress', label: t\('lgGProgress'\)/);
assert.match(ms, /practice: \{ key: 'practice', href: '\/learning\?tab=progress&s=commit'/);
assert.match(ms, /return tab === qq\.get\('tab'\) && \(params\.get\('s'\) \|\| ''\) === \(qq\.get\('s'\) \|\| ''\);/);
assert.doesNotMatch(read('components/PracticeBlock.js'), /tab=commit/);
assert.match(read('app/globals.css'), /\.lg-top\.solo \{/);
console.log('web learning N2 OK');
