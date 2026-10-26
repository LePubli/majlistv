// Lecteur YouTube / Vimeo intégré : identifiants, page générée, messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEmbedHtml, commandScript, parseEmbedMessage, validDailymotionPlayer, validEmbedId } from '../src/lib/embed';

test('identifiants : YouTube 11 caractères, Vimeo chiffres ; le reste est refusé (pas d’injection)', () => {
  assert.equal(validEmbedId('youtube', 'dQw4w9WgXcQ'), true);
  assert.equal(validEmbedId('youtube', "x');alert(1);('"), false);
  assert.equal(validEmbedId('youtube', 'court'), false);
  assert.equal(validEmbedId('vimeo', '76979871'), true);
  assert.equal(validEmbedId('vimeo', '76979871"><script>'), false);
  assert.equal(validEmbedId('archive', 'abc'), false);
  assert.equal(validEmbedId('youtube', null), false);
  assert.throws(() => buildEmbedHtml('youtube', "');evil()//", { origin: 'https://x.fr' }));
});

test('page YouTube : identifiant, départ, aperçu, origine, messages vers l’application', () => {
  const h = buildEmbedHtml('youtube', 'dQw4w9WgXcQ', { start: 61.7, limit: 120, auto: true, origin: 'https://majlisstv.le-publicitaire.fr' });
  assert.match(h, /videoId:'dQw4w9WgXcQ'/);
  assert.match(h, /start:61,/);
  assert.match(h, /autoplay:1,/);
  assert.match(h, /LIMIT=120/);
  assert.match(h, /origin:'https:\/\/majlisstv\.le-publicitaire\.fr'/);
  assert.match(h, /youtube-nocookie\.com/);
  assert.match(h, /ReactNativeWebView\.postMessage/);
  const off = buildEmbedHtml('youtube', 'dQw4w9WgXcQ', { origin: 'https://x.fr' });
  assert.match(off, /autoplay:0,/); assert.match(off, /start:0,/); assert.match(off, /LIMIT=0/);
});

test('page Vimeo : adresse du lecteur, départ #t=, lancement automatique, aperçu', () => {
  const h = buildEmbedHtml('vimeo', '76979871', { start: 90, limit: 60, auto: true, origin: 'https://x.fr' });
  assert.match(h, /player\.vimeo\.com\/video\/76979871\?dnt=1/);
  assert.match(h, /&autoplay=1/);
  assert.match(h, /#t=90s/);
  assert.match(h, /LIMIT=60/);
  assert.doesNotMatch(buildEmbedHtml('vimeo', '76979871', { origin: 'https://x.fr' }), /autoplay=1|#t=/);
});

test('messages du lecteur : lus, ou ignorés s’ils ne viennent pas de lui', () => {
  assert.deepEqual(parseEmbedMessage('{"t":"time","c":12.5,"d":600,"playing":true}'), { t: 'time', c: 12.5, d: 600, playing: true });
  assert.deepEqual(parseEmbedMessage('{"t":"ready","d":"45"}'), { t: 'ready', d: 45 });
  assert.deepEqual(parseEmbedMessage('{"t":"ended"}'), { t: 'ended' });
  assert.deepEqual(parseEmbedMessage('{"t":"state","playing":0}'), { t: 'state', playing: false });
  assert.equal(parseEmbedMessage('pas du json'), null);
  assert.equal(parseEmbedMessage('{"t":"inconnu"}'), null);
  assert.equal(parseEmbedMessage('null'), null);
});

test('commandes envoyées à la page', () => {
  assert.equal(commandScript({ c: 'seek', v: 30 }), 'window.cmd && window.cmd({"c":"seek","v":30}); true;');
  assert.match(commandScript({ c: 'rate', v: 1.5 }), /"rate"/);
});

test('Dailymotion : identifiant et Player ID validés, page pilotée par le lecteur', () => {
  assert.equal(validEmbedId('dailymotion', 'x8abcd1'), true);
  assert.equal(validEmbedId('dailymotion', "x8');evil()//"), false);
  assert.equal(validDailymotionPlayer('xabc12'), true);
  assert.equal(validDailymotionPlayer('x"><script>'), false);
  assert.equal(validDailymotionPlayer(''), false);
  assert.throws(() => buildEmbedHtml('dailymotion', 'x8abcd1', { origin: 'https://x.fr' }), /Player ID/);
  const h = buildEmbedHtml('dailymotion', 'x8abcd1', { start: 42.9, limit: 120, auto: true, origin: 'https://x.fr', playerId: 'xabc12' });
  assert.match(h, /geo\.dailymotion\.com\/libs\/player\/xabc12\.js/);
  assert.match(h, /video:'x8abcd1'/);
  assert.match(h, /startTime:42,/);
  assert.match(h, /autoplay:true/);
  assert.match(h, /LIMIT=120/);
  assert.match(h, /VIDEO_TIMECHANGE/);
});
