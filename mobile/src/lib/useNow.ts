// Horloge qui bat toutes les `ms` millisecondes tant que `active` ; renvoie null avant le premier battement.
import { useEffect, useState } from 'react';

export function useNow(ms = 1000, active = true): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return now;
}
