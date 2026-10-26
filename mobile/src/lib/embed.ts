// Lecteur YouTube / Vimeo / Dailymotion intégré : page HTML minimale chargée dans une WebView, pilotée par messages.
// Pur (testé avec Node) : validation des identifiants, construction de la page, lecture des messages.

export type EmbedKind = 'youtube' | 'vimeo' | 'dailymotion';

const YT_ID = /^[\w-]{11}$/;
const VIMEO_ID = /^\d{4,12}$/;
const DM_ID = /^[A-Za-z0-9]{5,16}$/;
const DM_PLAYER = /^[A-Za-z0-9]{3,20}$/;

/** Player ID Dailymotion accepté (réglage de l'administrateur) ; jamais injecté dans la page sans cette vérification. */
export const validDailymotionPlayer = (id: string | null | undefined): boolean => !!id && DM_PLAYER.test(id);

/** Identifiant accepté pour cette plateforme (jamais injecté dans la page sans cette vérification). */
export function validEmbedId(kind: string, id: string | null | undefined): boolean {
  if (!id) return false;
  return kind === 'youtube' ? YT_ID.test(id) : kind === 'vimeo' ? VIMEO_ID.test(id) : kind === 'dailymotion' ? DM_ID.test(id) : false;
}

export type EmbedMessage =
  | { t: 'ready'; d: number }
  | { t: 'time'; c: number; d: number; playing: boolean }
  | { t: 'state'; playing: boolean }
  | { t: 'ended' }
  | { t: 'error'; code?: number | string };

/** Lit un message envoyé par la page ; null si ce n'est pas un message du lecteur. */
export function parseEmbedMessage(raw: string): EmbedMessage | null {
  try {
    const m = JSON.parse(raw);
    if (!m || typeof m !== 'object') return null;
    if (m.t === 'ready') return { t: 'ready', d: Number(m.d) || 0 };
    if (m.t === 'time') return { t: 'time', c: Number(m.c) || 0, d: Number(m.d) || 0, playing: !!m.playing };
    if (m.t === 'state') return { t: 'state', playing: !!m.playing };
    if (m.t === 'ended') return { t: 'ended' };
    if (m.t === 'error') return { t: 'error', code: m.code };
  } catch { /* message étranger */ }
  return null;
}

/** Commande envoyée à la page (appelée par injectJavaScript). */
export type EmbedCommand = { c: 'seek'; v: number } | { c: 'play' } | { c: 'pause' } | { c: 'rate'; v: number };
export const commandScript = (cmd: EmbedCommand) => `window.cmd && window.cmd(${JSON.stringify(cmd)}); true;`;

const BASE_CSS = 'html,body{margin:0;height:100%;background:#000;overflow:hidden}#w,#w>*,#p,#p iframe{position:absolute;inset:0;width:100%;height:100%;border:0}';

/** Page HTML du lecteur. start = seconde de départ ; limit = fin de l'aperçu (0 = pas de limite) ; auto = lancement automatique. */
export function buildEmbedHtml(kind: EmbedKind, id: string, opts: { start?: number; limit?: number; auto?: boolean; origin: string; playerId?: string }): string {
  if (!validEmbedId(kind, id)) throw new Error('identifiant de vidéo invalide');
  const start = Math.max(0, Math.floor(opts.start || 0));
  const limit = Math.max(0, Math.ceil(opts.limit || 0));
  const auto = opts.auto ? 1 : 0;
  if (kind === 'dailymotion' && !validDailymotionPlayer(opts.playerId)) throw new Error('Player ID Dailymotion manquant');
  const head = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${BASE_CSS}</style></head><body><div id="p"></div>`;
  const post = 'function post(o){window.ReactNativeWebView.postMessage(JSON.stringify(o))}';
  if (kind === 'youtube') {
    return `${head}<script src="https://www.youtube.com/iframe_api"></script><script>
${post}
var pl,playing=false,LIMIT=${limit};
function tick(){try{var c=pl.getCurrentTime()||0;post({t:'time',c:c,d:pl.getDuration()||0,playing:playing});if(LIMIT&&c>=LIMIT){pl.pauseVideo();pl.seekTo(LIMIT,true);post({t:'ended'})}}catch(e){}}
function onYouTubeIframeAPIReady(){pl=new YT.Player('p',{videoId:'${id}',host:'https://www.youtube-nocookie.com',
playerVars:{autoplay:${auto},start:${start},rel:0,playsinline:1,iv_load_policy:3,modestbranding:1,origin:'${opts.origin}'},
events:{onReady:function(){post({t:'ready',d:pl.getDuration()||0});setInterval(tick,500)},
onStateChange:function(e){playing=e.data===1;post({t:'state',playing:playing});if(e.data===0)post({t:'ended'})},
onError:function(e){post({t:'error',code:e.data})}}})}
window.cmd=function(m){if(!pl)return;if(m.c==='seek')pl.seekTo(m.v,true);else if(m.c==='play')pl.playVideo();else if(m.c==='pause')pl.pauseVideo();else if(m.c==='rate')pl.setPlaybackRate(m.v)};
</script></body></html>`;
  }
  if (kind === 'dailymotion') {
    return `${head.replace('<div id="p"></div>', '<div id="w"></div>')}<script src="https://geo.dailymotion.com/libs/player/${opts.playerId}.js"></script><script>
${post}
var LIMIT=${limit},playing=false,cur=0,dur=0,pl=null;
function tm(){post({t:'time',c:cur,d:dur,playing:playing})}
dailymotion.createPlayer('w',{video:'${id}',params:{startTime:${start},autoplay:${auto ? 'true' : 'false'}}}).then(function(p){
pl=p;var E=dailymotion.events;
p.on(E.VIDEO_DURATIONCHANGE,function(s){dur=(s&&s.videoDuration)||dur;post({t:'ready',d:dur})});
p.on(E.VIDEO_TIMECHANGE,function(s){cur=(s&&s.videoTime)||0;dur=(s&&s.videoDuration)||dur;tm();if(LIMIT&&cur>=LIMIT){p.pause();p.seek(LIMIT);post({t:'ended'})}});
p.on(E.VIDEO_PLAY,function(){playing=true;post({t:'state',playing:true})});p.on(E.VIDEO_PAUSE,function(){playing=false;post({t:'state',playing:false})});
p.on(E.VIDEO_END,function(){playing=false;post({t:'ended'})});p.on(E.PLAYER_ERROR,function(){post({t:'error',code:'dailymotion'})});
}).catch(function(){post({t:'error',code:'dailymotion'})});
window.cmd=function(m){if(!pl)return;if(m.c==='seek')pl.seek(m.v);else if(m.c==='play')pl.play();else if(m.c==='pause')pl.pause()};
</script></body></html>`;
  }
  return `${head}<script src="https://player.vimeo.com/api/player.js"></script><script>
${post}
var LIMIT=${limit},playing=false,cur=0,dur=0;
var f=document.createElement('iframe');f.src='https://player.vimeo.com/video/${id}?dnt=1&title=0&byline=0&portrait=0&playsinline=1${auto ? '&autoplay=1' : ''}${start ? `#t=${start}s` : ''}';
f.allow='autoplay; fullscreen; picture-in-picture';f.allowFullscreen=true;document.getElementById('p').appendChild(f);
var pl=new Vimeo.Player(f);
pl.ready().then(function(){return pl.getDuration()}).then(function(d){dur=d||0;post({t:'ready',d:dur})}).catch(function(e){post({t:'error',code:'vimeo'})});
pl.on('timeupdate',function(e){cur=e.seconds||0;dur=e.duration||dur;post({t:'time',c:cur,d:dur,playing:playing});if(LIMIT&&cur>=LIMIT){pl.pause();pl.setCurrentTime(LIMIT);post({t:'ended'})}});
pl.on('play',function(){playing=true;post({t:'state',playing:true})});pl.on('pause',function(){playing=false;post({t:'state',playing:false})});
pl.on('ended',function(){playing=false;post({t:'ended'})});pl.on('error',function(e){post({t:'error',code:'vimeo'})});
window.cmd=function(m){if(m.c==='seek')pl.setCurrentTime(m.v);else if(m.c==='play')pl.play();else if(m.c==='pause')pl.pause();else if(m.c==='rate')pl.setPlaybackRate(m.v)};
</script></body></html>`;
}
