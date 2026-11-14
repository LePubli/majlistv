// Étape C-2 — contenus payants à l'unité, côté site : encart d'achat / location (vidéo, Audyn), Studio, Mes achats, Admin → Ventes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(join(web, p), 'utf8');
const box = read('components/SaleBox.js');
for (const p of ["call('/sales/checkout'", "call('/sales/terms'", 'JSON.stringify({ kind, id, mode, terms })', 'disabled={busy || !terms || !opt}', "qs.get('paid') === '1'", 'tries >= 10', '/login?next=']) assert.ok(box.includes(p), p);
const tc = read('app/talks/[id]/TalkClient.js');
assert.match(tc, /talk\.locked && talk\.sale \? \(\s*<SaleBox kind="talk" id=\{id\} sale=\{talk\.sale\} onPaid=\{reloadTalk\} \/>/);
assert.match(tc, /talk\.sale\?\.owned && <p className="sale-owned-line"><SaleOwned sale=\{talk\.sale\} \/><\/p>/);
const au = read('app/audyn/[id]/page.js');
assert.match(au, /!b\.access\.full && b\.sale && <SaleBox kind="audyn"/);
assert.match(au, /!b\.access\.full && !b\.sale && <p className="aw-box">/);
assert.match(read('app/audyn/page.js'), /b\.onSale && !b\.full \? <span className="badge sale">/);
const ed = read('components/SaleEditor.js');
for (const p of ['/studio/sales/${kind}/${id}', "method: 'PUT'", "method: 'DELETE'", "feat('sales')", 'memberDiscountPct']) assert.ok(ed.includes(p), p);
assert.match(read('app/studio/[id]/page.js'), /<SaleEditor kind="talk" id=\{x\.id\} \/>/);
assert.match(read('app/studio/(module-audyn)/audyn/[id]/page.js'), /<SaleEditor kind="audyn" id=\{it\.id\} \/>/);
assert.match(read('components/MyPurchases.js'), /call\('\/me\/purchases'\)/);
assert.match(read('app/account/page.js'), /feat\('sales'\) \? \[\{ id: 'purchases', label: t\('mpTab'\) \}\]/);
const adm = read('components/SalesAdmin.js');
assert.ok(adm.includes('/admin/sales/${p.id}/refund') && adm.includes('/admin/sales?status=${status}'));
assert.match(read('components/AdminShell.js'), /sales: 'sales' \}/);
assert.match(read('app/admin/page.js'), /tab === 'sales' && <SalesAdmin \/>/);
const i18n = read('lib/i18n.js');
for (const k of ['slTitle', 'slLead', 'slBuy', 'slRent', 'slBuyHelp', 'slRentHelp', 'slHours', 'slDays', 'slOwned', 'slRentedUntil', 'slMemberApplied', 'slMemberHint', 'slLogin', 'slPaidWait', 'slPaidLate', 'slCanceled', 'slBadge',
  'seTitle', 'seOn', 'seOff', 'seBuyPrice', 'seRentPrice', 'seRentHours', 'seDiscount', 'seHelp', 'sePut', 'seUpdate', 'seRemove', 'seRemoveAsk', 'mpTab', 'mpTitle', 'mpEmpty', 'mpRefunded', 'saNav', 'saRefund', 'saRefundAsk'])
  assert.equal((i18n.match(new RegExp(`^    ${k}: `, 'gm')) || []).length, 3, k);
const css = read('app/globals.css');
assert.match(css, /\.sale-opts \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(220px, 1fr\)\)/);
assert.match(css, /@media \(max-width: 560px\) \{\s*\.mp-list li/);
console.log('test_sales_web : OK');
