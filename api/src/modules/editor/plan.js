// Module « Éditeur de montage » — étape E4a : le PLAN DE RENDU.
//
// Le montage (extraits, son, habillage) est transformé ici en un « plan » : la liste des fichiers à lire, le graphe de filtres FFmpeg
// (vidéo et audio), le fichier de textes ASS et les courbes de baisse du volume. Le plan est enregistré avec la demande de rendu ;
// le worker (worker/src/render.js) n'a plus qu'à télécharger les fichiers, remplacer quelques valeurs (taille de l'image, cadence,
// chemins) et lancer FFmpeg. Toute la logique du montage reste donc ici, à côté de ses tests, et le même code (dress.js) fabrique
// l'image finale de « Voir l'image finale » et le rendu.
//
// Ce fichier ne touche ni à la base ni au stockage : il reçoit tout ce dont il a besoin (voir buildPlan).
//
// Règles de fidélité avec l'aperçu du site (web/modules/editor/ops.js) :
//   - voix d'origine : volume, coupée, petit fondu à chaque raccord (joinFadeMs), réduction du bruit (afftdn) ;
//     elle baisse sous la voix française (dub.duck %) avec une rampe de dub.fade secondes autour des phrases doublées ;
//   - voix française : seulement dans les passages non gardés en voix d'origine, volume dub.gainDb ;
//   - musiques : placées dans le temps du montage, boucle, fondus, volume, baisse sous la voix (rampe de 0,3 s) ;
//   - niveau sonore homogène : loudnorm (deux passes), cible en LUFS ;
//   - transitions : « fondu au noir / blanc » centré sur le raccord, len/2 avant et len/2 après (fondu appliqué à chaque extrait) ;
//   - textes, bandeaux, sous-titres incrustés, logo, écrans d'ouverture et de fin : dress.js (mêmes réglages que « Voir l'image finale »).
// Différence assumée : l'aperçu du navigateur ne dépasse pas 100 % de volume ; le rendu applique le volume demandé (jusqu'à +12 dB).
import { layout, mapItems, transitionAt, dressEvents, buildAss, fillVars, dressDefaults, LOGO_XY } from './dress.js';
import { audioDefaults } from './timeline.js';
import { DENOISE_FILTER } from './denoise.js';
import { cropFilter, buildShortAss } from './short.js';

export const MAX_PARTS = 120;       // extraits (après regroupement des extraits qui se suivent) : un fichier source ouvert par extrait
export const CURVE_HZ = 1000;       // cadence des courbes de baisse du volume lues par FFmpeg
export const GOLD_HEX = '0xE6A739';
export const CARD_HEX = '0x0B0906';

const r3 = (x) => Math.round(x * 1000) / 1000;
export const dbToLin = (db) => 10 ** ((Number(db) || 0) / 20);

// --- Enveloppe (même règle que ops.js : 0 hors des passages, 1 dedans, rampe de « fade » secondes avant et après) --------------
export function envelope(T, spans, fade) {
  let best = 0;
  for (const s of spans) {
    if (s.ts - fade > T) break;
    if (T >= s.ts && T <= s.te) return 1;
    const d = T < s.ts ? s.ts - T : T - s.te;
    if (fade > 0 && d < fade) best = Math.max(best, 1 - d / fade);
  }
  return best;
}

// Points de l'enveloppe, en lignes brisées EXACTES : l'enveloppe est le maximum de rampes linéaires, elle ne change de pente
// qu'aux bords des passages, au bout des rampes et au croisement de deux rampes voisines. spans triés, fade > 0.
export function envelopePoints(spans, fade, total) {
  const f = Math.max(fade, 0.002); // un fondu de 0 s devient une marche de 2 ms (évite une discontinuité)
  const cand = new Set([0, total]);
  const add = (t) => { if (t >= 0 && t <= total) cand.add(r3(t)); };
  spans.forEach((s, i) => {
    add(s.ts - f); add(s.ts); add(s.te); add(s.te + f);
    const nx = spans[i + 1];
    if (nx) { const gap = nx.ts - s.te; if (gap > 0 && gap < 2 * f) add(s.te + gap / 2); }
  });
  const ts = [...cand].sort((a, b) => a - b);
  // On garde les points où la pente change (tolérance) : la courbe reste exacte et petite.
  const pts = [];
  for (const t of ts) {
    const v = r3(envelope(t, spans, f));
    const n = pts.length;
    if (n >= 2) {
      const [t0, v0] = pts[n - 2]; const [t1, v1] = pts[n - 1];
      const expect = v0 + ((v1 - v0) * (t - t0)) / (t1 - t0 || 1);
      if (Math.abs(expect - v) < 0.0006) { pts[n - 1] = [t, v]; continue; }
    }
    pts.push([t, v]);
  }
  return pts;
}

// Valeur de l'enveloppe en lignes brisées (pour les tests et pour le worker, qui a la même fonction).
export function sampleCurve(pts, t) {
  if (!pts.length) return 0;
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i += 1) {
    if (t <= pts[i][0]) { const [t0, v0] = pts[i - 1]; const [t1, v1] = pts[i]; return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0); }
  }
  return pts[pts.length - 1][1];
}

// --- Regroupement des extraits qui se suivent dans la source (même fichier, pas de transition entre eux) -----------------------
function partsOf(clips, dress) {
  const parts = [];
  clips.forEach((c, i) => {
    const prev = parts[parts.length - 1];
    const tr = transitionAt(dress, clips, i);
    if (prev && !tr && Math.abs(prev.out - c.in) < 1e-3) { prev.out = c.out; prev.ids.push(c.id); return; }
    parts.push({ in: c.in, out: c.out, ids: [c.id], tr });
  });
  return parts.map((p, j) => ({ ...p, d: r3(p.out - p.in), j }));
}

const fmt = (x) => String(r3(x));

// Plan de rendu.
//   timeline : montage vérifié (checkTimeline)
//   vars     : { titre, intervenant }
//   cues     : sous-titres [{ s, e, text }] (temps source), utilisés si « sous-titres incrustés » ou, sans voix française, pour la baisse de la musique
//   dub      : null ou { segments: [{ s, e, keep }], voiceKey, duck } (module Doublage)
//   music    : { [idDeLaMusique]: { key } }
//   logo     : { key } | null
//   preview  : true = petit fichier rapide (aperçu), false = rendu final
//   title    : titre de la conférence (pour le nom du fichier)
//   short    : null, ou (étape E5b, extrait court 9:16) { cropX, captions: [{ s, e, text }] (temps source, déjà regroupés), titleText }.
//              Image verticale recadrée sur la source ; pas d'habillage (titre et sous-titres courts seulement).
export function buildPlan({ timeline, vars = {}, cues = [], dub = null, music = {}, logo = null, preview = false, title = '', short = null }) {
  const dress = dressDefaults(short ? null : timeline.dress);
  const au = audioDefaults(timeline.audio, { duck: dub?.duck });
  const clips = timeline.clips;
  const L = layout(clips);
  const total = r3(L.at(-1).end);
  const warnings = [];
  const I = dress.intro.on ? dress.intro.len : 0;
  const O = dress.outro.on ? dress.outro.len : 0;
  const outDur = r3(I + total + O);
  const parts = partsOf(clips, dress);
  if (parts.length > MAX_PARTS) {
    throw new Error(`Trop d’extraits pour un rendu : ${parts.length} (au plus ${MAX_PARTS}). Les extraits qui se suivent sans transition sont déjà regroupés ; supprimez ou regroupez quelques coupes.`);
  }

  const useDub = Boolean(dub?.voiceKey && au.dub.use);
  const useLogo = Boolean(dress.logo.on && logo?.key);
  if (dress.logo.on && !logo?.key) warnings.push('Logo choisi mais introuvable : il n’est pas incrusté.');

  const inputs = [];               // { ref, opts, use }
  const addInput = (ref, opts, use) => { inputs.push({ ref, opts, use }); return inputs.length - 1; };
  const refs = { source: true, ...(useDub ? { dub: { key: dub.voiceKey } } : {}) };

  // ---------------------------------------------------------------- Vidéo
  const V = [];
  const FPS = '@FPS@';
  const segLabels = [];
  if (I) {
    V.push(`color=c=${CARD_HEX}:s=@W@x@H@:r=${FPS}:d=${I},format=yuv420p,setsar=1,drawbox=x=(iw-@BARW@)/2:y=@BARY@:w=@BARW@:h=@BARH@:color=${GOLD_HEX}:t=fill,fps=${FPS},settb=1/${FPS}[vi]`);
    segLabels.push('vi');
  }
  const nextTr = (j) => (j + 1 < parts.length ? parts[j + 1].tr : null);
  parts.forEach((p) => {
    const k = addInput('source', ['-ss', fmt(p.in), '-t', fmt(p.d)], 'v');
    const chain = short
      ? [`[${k}:v]setpts=PTS-STARTPTS`, cropFilter(short.cropX), 'setsar=1', `fps=${FPS}`, 'format=yuv420p', `settb=1/${FPS}`] // extrait 9:16 : cadre vertical sur la source
      : [`[${k}:v]setpts=PTS-STARTPTS`, 'scale=@W@:@H@:force_original_aspect_ratio=decrease', 'pad=@W@:@H@:(ow-iw)/2:(oh-ih)/2:color=black', 'setsar=1', `fps=${FPS}`, 'format=yuv420p', `settb=1/${FPS}`];
    // Fondu au noir / au blanc : la moitié avant le raccord (fin de l'extrait précédent), la moitié après (début de celui-ci).
    if (p.tr) { const h = Math.min(p.tr.len / 2, p.d / 2); chain.push(`fade=t=in:st=0:d=${fmt(h)}:color=${p.tr.type === 'dipwhite' ? 'white' : 'black'}`); }
    const nt = nextTr(p.j);
    if (nt) { const h = Math.min(nt.len / 2, p.d / 2); chain.push(`fade=t=out:st=${fmt(p.d - h)}:d=${fmt(h)}:color=${nt.type === 'dipwhite' ? 'white' : 'black'}`); }
    V.push(`${chain.join(',')}[v${p.j}]`);
    segLabels.push(`v${p.j}`);
  });
  if (O) {
    V.push(`color=c=${CARD_HEX}:s=@W@x@H@:r=${FPS}:d=${O},format=yuv420p,setsar=1,drawbox=x=(iw-@BARW@)/2:y=@BARY@:w=@BARW@:h=@BARH@:color=${GOLD_HEX}:t=fill,fps=${FPS},settb=1/${FPS}[vo]`);
    segLabels.push('vo');
  }
  V.push(segLabels.length === 1 ? `[${segLabels[0]}]null[vcat]` : `${segLabels.map((l) => `[${l}]`).join('')}concat=n=${segLabels.length}:v=1:a=0,settb=1/${FPS}[vcat]`);

  // Textes (ASS) : titres, bandeaux, sous-titres incrustés, écrans d'ouverture et de fin. Temps décalés de la durée de l'intro.
  const cueMap = mapItems(clips, cues).map((m) => ({ ts: m.ts, te: m.te, text: m.text }));
  if (!short && dress.subs.burn && !cueMap.length) warnings.push('Sous-titres incrustés demandés, mais la conférence n’a pas de sous-titres : rien n’est incrusté.');
  let ass;
  if (short) {
    // Extrait court : sous-titres déjà regroupés (temps source → temps de l'extrait) et titre du début.
    const caps = mapItems(clips, short.captions || []).map((m) => ({ s: m.ts, e: m.te, text: m.text }));
    if (short.wantCaptions && !caps.length) warnings.push('Sous-titres demandés, mais ce passage n’a pas de texte : rien n’est incrusté.');
    ass = buildShortAss({ chunks: caps, title: short.titleText || '', total });
  } else {
    const events = dressEvents(dress, { vars, total, cues: cueMap, fade: true, offset: I });
    const cards = [];
    if (I) cards.push({ a: 0, b: I, title: fillVars(dress.intro.title, vars), sub: fillVars(dress.intro.sub, vars) });
    if (O) cards.push({ a: I + total, b: I + total + O, title: fillVars(dress.outro.title, vars), sub: fillVars(dress.outro.sub, vars) });
    ass = buildAss(events, { cards, fade: true });
  }
  V.push('[vcat]ass=filename=@ASS@:fontsdir=@FONTS@[vt]');
  let cur = 'vt';
  if (useLogo) {
    const lg = addInput('logo', ['-loop', '1', '-t', fmt(outDur + 1)], 'v');
    const op = (dress.logo.opacity / 100).toFixed(2);
    const [x, y] = LOGO_XY(dress.logo.pos, '@LM@');
    const from = r3(I + dress.logo.from); const to = r3(I + Math.min(dress.logo.to ?? total, total));
    const wantCards = Boolean(I || O);
    V.push(`[${lg}:v]format=rgba,colorchannelmixer=aa=${op}${wantCards ? ',split=2[lga][lgb]' : '[lga]'}`);
    V.push(`[lga]scale=@LW@:-1[lgs]`);
    if (to > from + 0.01) { V.push(`[${cur}][lgs]overlay=x=${x}:y=${y}:shortest=1:enable='between(t,${fmt(from)},${fmt(to)})'[vl]`); cur = 'vl'; }
    else V.push('[lgs]nullsink');
    if (wantCards) {
      // Sur les écrans d'ouverture et de fin : logo centré, plus grand, opaque (comme « Voir l'image finale »).
      V.push('[lgb]scale=@LWC@:-1,colorchannelmixer=aa=1[lgc]');
      const wins = [];
      if (I) wins.push(`between(t,0,${fmt(I)})`);
      if (O) wins.push(`between(t,${fmt(I + total)},${fmt(outDur)})`);
      V.push(`[${cur}][lgc]overlay=x=(W-w)/2:y=@LYC@:shortest=1:enable='${wins.join('+')}'[vc]`); cur = 'vc';
    }
  }
  V.push(`[${cur}]format=yuv420p[vout]`);

  // ---------------------------------------------------------------- Audio
  const A = [];
  const mixLabels = [];
  const curves = [];                       // courbes de baisse du volume : { id, env, depth } (g = 1 - env × depth)
  const envelopes = {};
  const mapSpans = (items) => mapItems(clips, items).map((m) => ({ ts: m.ts, te: m.te })).sort((a, b) => a.ts - b.ts);
  const dubSp = useDub ? mapSpans((dub.segments || []).filter((s) => !s.keep)) : [];
  const speechSp = mapSpans(cues);
  const voiceSp = useDub ? dubSp : speechSp;
  const getEnv = (name, spans, fade) => { if (!envelopes[name]) envelopes[name] = envelopePoints(spans, fade, total + 1); return name; };
  const curveInput = (env, depth) => {
    const id = `cv${curves.length}`;
    curves.push({ id, env, depth: r3(depth) });
    return addInput(`curve:${id}`, ['-f', 'f32le', '-ar', String(CURVE_HZ), '-ac', '1'], 'a');
  };
  const AF = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
  // Voix d'origine (extrait par extrait, avec un petit fondu à chaque raccord).
  if (!au.orig.mute) {
    const half = au.orig.joinFadeMs / 2000;
    const chains = parts.map((p) => {
      const k = addInput('source', ['-ss', fmt(p.in), '-t', fmt(p.d)], 'a');
      const c = [`[${k}:a]asetpts=PTS-STARTPTS`, AF, 'apad', `atrim=0:${fmt(p.d)}`];
      if (DENOISE_FILTER[au.orig.denoise]) c.push(DENOISE_FILTER[au.orig.denoise]);
      const h = Math.min(half, p.d / 2);
      if (h > 0.0005 && p.j > 0) c.push(`afade=t=in:st=0:d=${fmt(h)}`);
      if (h > 0.0005 && p.j < parts.length - 1) c.push(`afade=t=out:st=${fmt(p.d - h)}:d=${fmt(h)}`);
      return `${c.join(',')}[ao${p.j}]`;
    });
    A.push(...chains);
    A.push(parts.length === 1 ? '[ao0]anull[aocat]' : `${parts.map((p) => `[ao${p.j}]`).join('')}concat=n=${parts.length}:v=0:a=1[aocat]`);
    let lab = 'aocat';
    const g = dbToLin(au.orig.gainDb);
    if (Math.abs(g - 1) > 1e-4) { A.push(`[${lab}]volume=${g.toFixed(5)}[aog]`); lab = 'aog'; }
    // Baisse sous la voix française : g = 1 - env × (1 - duck %).
    const depth = 1 - au.dub.duck / 100;
    if (useDub && dubSp.length && depth > 0.0005) {
      const cvk = curveInput(getEnv('orig', dubSp, au.dub.fade), depth);
      A.push(`[${cvk}:a]${AF}[cvo]`);
      A.push(`[${lab}][cvo]amultiply[aod]`); lab = 'aod';
    }
    A.push(`[${lab}]apad=whole_dur=${fmt(total)},atrim=0:${fmt(total)},asetpts=PTS-STARTPTS[amo]`);
    mixLabels.push('amo');
  }
  // Voix française (seules les phrases doublées sont dans la piste ; le reste est silencieux).
  if (useDub) {
    parts.forEach((p) => {
      const k = addInput('dub', ['-ss', fmt(p.in), '-t', fmt(p.d)], 'a');
      A.push(`[${k}:a]asetpts=PTS-STARTPTS,${AF},apad,atrim=0:${fmt(p.d)}[ad${p.j}]`);
    });
    A.push(parts.length === 1 ? '[ad0]anull[adcat]' : `${parts.map((p) => `[ad${p.j}]`).join('')}concat=n=${parts.length}:v=0:a=1[adcat]`);
    A.push(`[adcat]volume=${dbToLin(au.dub.gainDb).toFixed(5)},apad=whole_dur=${fmt(total)},atrim=0:${fmt(total)},asetpts=PTS-STARTPTS[amd]`);
    mixLabels.push('amd');
  }
  // Musiques de fond.
  au.music.forEach((m, i) => {
    const a = music[m.asset];
    if (!a?.key) throw new Error('Une musique du montage n’est plus dans la bibliothèque : retirez-la ou choisissez-en une autre.');
    refs.music = { ...(refs.music || {}), [m.asset]: { key: a.key } };
    const k = addInput(`music:${m.asset}`, m.loop ? ['-stream_loop', '-1'] : [], 'a');
    const c = [`[${k}:a]${AF}`, `atrim=start=${fmt(m.offset)}:end=${fmt(m.offset + m.len)}`, 'asetpts=PTS-STARTPTS', `volume=${dbToLin(m.gainDb).toFixed(5)}`];
    if (m.fadeIn > 0) c.push(`afade=t=in:st=0:d=${fmt(m.fadeIn)}`);
    if (m.fadeOut > 0) c.push(`afade=t=out:st=${fmt(Math.max(0, m.len - m.fadeOut))}:d=${fmt(m.fadeOut)}`);
    c.push('apad', `atrim=0:${fmt(m.len)}`, `adelay=${Math.round(m.start * 1000)}:all=1`, `apad=whole_dur=${fmt(total)}`, `atrim=0:${fmt(total)}`);
    let lab = `mu${i}`;
    A.push(`${c.join(',')}[${lab}]`);
    const depth = 1 - dbToLin(m.duckDb);
    if (m.duck && voiceSp.length && depth > 0.0005) {
      const cvk = curveInput(getEnv('voice', voiceSp, 0.3), depth);
      A.push(`[${cvk}:a]${AF}[cvm${i}]`);
      A.push(`[${lab}][cvm${i}]amultiply[mud${i}]`); lab = `mud${i}`;
    }
    A.push(`[${lab}]asetpts=PTS-STARTPTS[amm${i}]`);
    mixLabels.push(`amm${i}`);
  });
  // Mélange (chaque source dure exactement la durée du montage), puis écrans d'ouverture et de fin silencieux.
  if (!mixLabels.length) A.push(`anullsrc=r=48000:cl=stereo,atrim=0:${fmt(total)},asetpts=PTS-STARTPTS[amix]`);
  else if (mixLabels.length === 1) A.push(`[${mixLabels[0]}]anull[amix]`);
  else A.push(`${mixLabels.map((l) => `[${l}]`).join('')}amix=inputs=${mixLabels.length}:normalize=0:duration=longest[amix]`);
  const pieces = [];
  if (I) { A.push(`anullsrc=r=48000:cl=stereo,atrim=0:${fmt(I)},asetpts=PTS-STARTPTS[asi]`); pieces.push('asi'); }
  pieces.push('amix');
  if (O) { A.push(`anullsrc=r=48000:cl=stereo,atrim=0:${fmt(O)},asetpts=PTS-STARTPTS[aso]`); pieces.push('aso'); }
  A.push(pieces.length === 1 ? '[amix]anull[afin]' : `${pieces.map((l) => `[${l}]`).join('')}concat=n=${pieces.length}:v=0:a=1[afin]`);
  // @LN@ : le worker met ici loudnorm (passe de mesure, puis passe finale avec les valeurs mesurées) ou rien.
  A.push('[afin]@LN@,aresample=48000,aformat=channel_layouts=stereo[aout]');

  return {
    v: 1, preview, title, total, introLen: I, outroLen: O, outDur, vertical: Boolean(short),
    loudness: { on: Boolean(au.loudness.on), target: au.loudness.target },
    inputs, refs: { ...refs, ...(useLogo ? { logo: { key: logo.key } } : {}) },
    curves, envelopes,
    script: { video: V.join(';\n'), audio: A.join(';\n') },
    ass,
    // Valeurs qui dépendent de la taille de l'image, calculées par le worker : { nom: [base, facteur] }.
    tokens: {
      LW: ['W', dress.logo.size / 100], LWC: ['W', 0.14], LM: ['W', 0.021], LYC: ['H', 0.18],
      BARW: ['W', 0.125], BARH: ['H', 0.0056], BARY: ['H', 0.52 + 78 / 1080],
    },
    summary: {
      parts: parts.length, clips: clips.length, items: dress.items.length, music: au.music.length, dub: useDub, denoise: au.orig.denoise,
      logo: useLogo, subs: short ? Boolean((short.captions || []).length) : Boolean(dress.subs.burn && cueMap.length), vertical: Boolean(short), transitions: parts.filter((p) => p.tr).length, intro: I, outro: O,
    },
    warnings,
  };
}

// Durée de calcul estimée (secondes) : mesures d'E0 sur le VPS (4 fils) : aperçu ≈ 0,3 × la durée ; 1080p ≈ 0,85 × ; deux passes du son en plus.
export const estimateSeconds = (outDur, preview) => Math.round(outDur * (preview ? 0.3 : 1.0));
