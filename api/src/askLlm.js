// Étape 41 — appel du modèle Claude pour l'assistant de conférence (réponse forcée sous forme d'appel d'outil, donc structurée).
// ANTHROPIC_API_URL ne sert qu'aux tests (faux serveur local), comme dans le service de traduction.
import { getSetting } from './settings.js';
import { TOOL } from './askLib.js';

const URL_ = () => process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages';

export async function askConfig() {
  const key = String(await getSetting('anthropic_key') || '').trim();
  const model = String(await getSetting('ask_model') || '').trim() || String(await getSetting('claude_model') || '').trim() || 'claude-haiku-5-5';
  return { key, model };
}

/** Renvoie { input (objet de l'outil), tokensIn, tokensOut } ou lève une erreur (réseau, clé refusée, réponse inattendue). */
export async function askModel({ key, model, system, user }) {
  const res = await fetch(URL_(), {
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
