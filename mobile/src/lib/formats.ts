// Noms des formats (Conférence, Cours, Documentaire…) pour le badge des vignettes, comme sur le site.
// Chargés une seule fois puis gardés en mémoire.
import { useEffect, useState } from 'react';
import { useSession } from '@/lib/session';
import type { FormatItem } from '@/lib/types';
import { pickFormatName } from '@/lib/formatPick';

let cache: FormatItem[] | null = null;
let pending: Promise<FormatItem[]> | null = null;

/** Renvoie une fonction slug → nom du format dans la langue courante (vide tant que la liste n'est pas chargée). */
export function useFormatName(): (slug: string | null | undefined) => string {
  const { api, locale } = useSession();
  const [list, setList] = useState<FormatItem[]>(cache ?? []);
  useEffect(() => {
    if (cache) return;
    pending = pending ?? api.get<FormatItem[]>('/formats', {}, false).then((r) => (Array.isArray(r) ? r : [])).catch(() => []);
    let live = true;
    pending.then((r) => { if (r.length) cache = r; if (live) setList(r); });
    return () => { live = false; };
  }, [api]);
  return (slug) => pickFormatName(list, slug, locale);
}
