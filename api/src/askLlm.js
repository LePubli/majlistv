// Étape 41 — appel du modèle d'IA pour l'assistant de conférence : Claude (réponse forcée en appel d'outil) ou DeepSeek (réponse JSON).
// Les clés et le modèle DeepSeek sont ceux déjà saisis pour la traduction et les résumés (Admin → Paramètres → Traduction des sous-titres) : rien à ressaisir.
// ANTHROPIC_API_URL / DEEPSEEK_API_URL ne servent qu'aux tests (faux serveurs locaux), comme dans le service de traduction.
// Azure AI Translator ne peut pas servir ici : c'est un service de traduction, il ne sait pas répondre à une question.
import { getSetting } from './settings.js';
import { TOOL } from './askLib.js';

const CLAUDE_URL = () => process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages';
const DEEPSEEK_URL = () => process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';

/** Choisit le moteur : réglage « ask_provider » (auto = DeepSeek s'il a une clé, sinon Claude, comme les résumés). Renvoie { provider, key, model } ; key vide = aucun moteur utilisable. */
export async function askConfig() {
  const claudeKey = String(await getSetting('anthropic_key') || '').trim();
  const deepKey = String(await getSetting('deepseek_key') || '').trim();
  const wanted = String(await getSetting('ask_provider') || 'auto').trim().toLowerCase();
  const provider = wanted === 'claude' ? (claudeKey ? 'claude' : null)
    : wanted === 'deepseek' ? (deepKey ? 'deepseek' : null)
      : (deepKey ? 'deepseek' : (claudeKey ? 'claude' : null));
  if (provider === 'deepseek') return { provider, key: deepKey, model: String(await getSetting('deepseek_model') || '').trim() || 'deepseek-flash' };
  if (provider === 'claude') return { provider, key: claudeKey, model: String(await getSetting('ask_model') || '').trim() || String(await getSetting('claude_model') || '').trim() || 'claude-haiku-5-5' };
  return { provider: null, key: '', model: '' };
}

/** Renvoie { input (objet { status, answer, passages }), tokensIn, tokensOut } ou lève une erreur (réseau, clé refusée, réponse inattendue). */
export async function askModel({ provider, key, model, system, user }) {
  if (provider === 'deepseek') {
    const res = await fetch(DEEPSEEK_URL(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, max_tokens: 700, stream: false, temperature: 0, response_format: { type: 'json_object' }, thinking: { type: 'disabled' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      signal: AbortSignal.timeout(45000),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`DeepSeek ${res.status} ${j?.error?.message || ''}`.trim().slice(0, 200));
    const choice = j.choices?.[0];
    let input = null;
    try { input = choice && choice.finish_reason !== 'length' ? JSON.parse(String(choice.message?.content || '').trim()) : null; } catch { input = null; }
    if (!input || typeof input !== 'object') throw new Error('Réponse inattendue du modèle');
    return { input, tokensIn: Number(j.usage?.prompt_tokens) || 0, tokensOut: Number(j.usage?.completion_tokens) || 0 };
  }
  const res = await fetch(CLAUDE_URL(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 700, temperature: 0, system, tools: [TOOL], tool_choice: { type: 'tool', name: TOOL.name }, messages: [{ role: 'user', content: user }] }),
    signal: AbortSignal.timeout(45000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Claude ${res.status} ${j?.error?.message || ''}`.trim().slice(0, 200));
  const block = (j.content || []).find((b) => b.type === 'tool_use' && b.name === TOOL.name);
  if (!block) throw new Error('Réponse inattendue du modèle');
  return { input: block.input, tokensIn: Number(j.usage?.input_tokens) || 0, tokensOut: Number(j.usage?.output_tokens) || 0 };
}
