// Reprise de lecture synchronisée avec le site (PUT /me/progress/:id).
// Règles : au plus un envoi toutes les `intervalMs` pendant la lecture ; envoi immédiat à la pause, à la sortie
// de l'écran ou quand l'application passe en arrière-plan ; jamais deux fois la même position ; rien si désactivé
// (visiteur non connecté, aperçu). Les erreurs réseau ne bloquent jamais la lecture : on réessaiera au prochain envoi.

export type ProgressPayload = { positionMs: number; durationMs: number };

export class ProgressTracker {
  private lastSentPos = -1;
  private lastSentAt = -Infinity;
  private pos = 0;
  private dur = 0;
  private inflight = false;

  constructor(
    private send: (p: ProgressPayload) => Promise<void>,
    private opts: { intervalMs?: number; enabled?: boolean; now?: () => number } = {},
  ) {}

  private get interval() { return this.opts.intervalMs ?? 10000; }
  private get now() { return (this.opts.now ?? Date.now)(); }
  private get enabled() { return this.opts.enabled !== false; }

  setEnabled(v: boolean) { this.opts.enabled = v; }

  /** À appeler à chaque mise à jour du lecteur (≈ 1 par seconde). */
  update(positionMs: number, durationMs: number, playing: boolean) {
    if (!Number.isFinite(positionMs) || positionMs < 0) return;
    this.pos = Math.round(positionMs);
    this.dur = Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : this.dur;
    if (playing && this.now - this.lastSentAt >= this.interval) void this.flush();
  }

  /** Envoie la position courante si elle a changé depuis le dernier envoi. */
  async flush(): Promise<void> {
    if (!this.enabled || this.inflight) return;
    if (this.pos === this.lastSentPos) return;
    if (this.pos < 1000 && this.lastSentPos < 0) return; // inutile d'enregistrer les premières secondes
    const payload = { positionMs: this.pos, durationMs: this.dur };
    this.inflight = true;
    this.lastSentAt = this.now;
    try {
      await this.send(payload);
      this.lastSentPos = payload.positionMs;
    } catch {
      /* silencieux : nouvel essai au prochain envoi */
    } finally {
      this.inflight = false;
    }
  }
}

/** Position de départ : la reprise du serveur, sinon le début. Ignore une reprise à moins de 5 s ou proche de la fin. */
export function resumeStartMs(resumeMs: number | undefined, durationSeconds: number | null | undefined): number {
  const r = Number(resumeMs) || 0;
  if (r < 5000) return 0;
  const d = (Number(durationSeconds) || 0) * 1000;
  if (d && r > d - 10000) return 0;
  return r;
}
