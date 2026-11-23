// Textes de la validation des shorts : notifications et e-mails, trois langues, avec et sans motif ; le motif est échappé dans l'e-mail.
import assert from 'node:assert/strict';
import { renderEmail } from '../src/emails.js';
import { pushText } from '../src/push.js';

const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };
for (const l of ['fr', 'en', 'ar']) {
  for (const k of ['shorts_approved', 'shorts_rejected']) {
    const m = renderEmail(k, l, { title: 'Mon court', note: 'Son <b>trop</b> faible', webUrl: 'https://exemple.fr', path: '/studio/shorts', name: 'Sara' });
    assert.ok(m.subject.includes('Mon court') && !/\{[a-z]+\}/.test(m.html + m.text), `${k}/${l} : variable oubliée`);
    assert.ok(!m.html.includes('<b>trop</b>'), `${k}/${l} : motif non échappé`);
    const p = pushText(k, l, { title: 'Mon court', note: 'Son trop faible' });
    assert.ok(p.title && p.body.includes('Mon court') && !/undefined/.test(p.body), `push ${k}/${l}`);
  }
  const noNote = renderEmail('shorts_rejected', l, { title: 'Mon court', note: '', webUrl: 'https://exemple.fr', path: '/studio/shorts' });
  assert.ok(!/\{note\}/.test(noNote.html + noNote.text), `rejected/${l} sans motif`);
}
ok(true, 'e-mails et notifications « short validé / refusé » : 2 modèles × 3 langues, motif échappé, ligne du motif facultative');
console.log('TOUT EST BON');
