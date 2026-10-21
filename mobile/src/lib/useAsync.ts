// Chargement d'une donnée : { data, error, loading, reload }. Relance quand `deps` change ; ignore les réponses périmées.
import { useCallback, useEffect, useRef, useState } from 'react';

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const run = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const load = useCallback(async () => {
    const id = ++run.current;
    setLoading(true);
    setError(null);
    try {
      const d = await fnRef.current();
      if (id === run.current) setData(d);
    } catch (e) {
      if (id === run.current) setError(e);
    } finally {
      if (id === run.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, loading, reload: load, setData };
}
