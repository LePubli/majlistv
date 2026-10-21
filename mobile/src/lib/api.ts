// Client de l'API Mejliss TV : JSON, jeton d'authentification, délai maximal, erreurs lisibles.
// Aucune dépendance native : testable avec Node (voir tests/api.test.ts).

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export type ApiOptions = {
  baseUrl: string;
  getToken: () => string | null;
  /** Appelé quand le serveur répond 401 alors qu'un jeton avait été envoyé (session expirée). */
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type ReqOptions = { body?: unknown; query?: Record<string, string | number | undefined | null>; auth?: boolean };

/** Adresse complète d'un chemin renvoyé par l'API (ex. /hls/…) ; une adresse déjà complète reste telle quelle. */
export function absoluteUrl(baseUrl: string, path: string): string {
  return /^https?:\/\//i.test(path) ? path : baseUrl.replace(/\/+$/, '') + (path.startsWith('/') ? path : '/' + path);
}

export function buildQuery(query?: ReqOptions['query']): string {
  if (!query) return '';
  const p = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return p.length ? '?' + p.join('&') : '';
}

export function createApi(opts: ApiOptions) {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 15000;

  async function request<T>(method: string, path: string, o: ReqOptions = {}): Promise<T> {
    const token = o.auth === false ? null : opts.getToken();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (o.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(absoluteUrl(opts.baseUrl, path) + buildQuery(o.query), {
        method,
        headers,
        body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
        signal: ctrl.signal,
      });
    } catch (err) {
      const aborted = (err as Error)?.name === 'AbortError';
      throw new ApiError(aborted ? 'timeout' : 'network', 0, aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 204) return undefined as T;
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      /* corps vide ou non JSON */
    }
    if (!res.ok) {
      if (res.status === 401 && token) opts.onUnauthorized?.();
      throw new ApiError(data?.error || `HTTP ${res.status}`, res.status, data?.code);
    }
    return data as T;
  }

  return {
    get: <T>(path: string, query?: ReqOptions['query'], auth?: boolean) => request<T>('GET', path, { query, auth }),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} }),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body: body ?? {} }),
    del: <T>(path: string) => request<T>('DELETE', path),
  };
}

export type Api = ReturnType<typeof createApi>;
