'use client';
// Lot C — pages « fonction » découpées en sections (tarifs, compte, bibliothèque…).
// La page garde TOUT son code (paiement, lecteur, quiz…) : elle déclare ses sections (une fonction qui dessine chacune) et leur ordre d'origine.
// Si l'éditeur a publié une page en blocs pour elle (/_func/<id>), les blocs « <Page> : <section> » retrouvent ici la section ; sinon la page
// s'affiche exactement comme avant.
import { Fragment, useEffect, useState } from 'react';
import { useApp } from './Providers';
import { BlocksView } from './PageBlocks';
import { FuncCtx } from './FuncCtx';

// Page en blocs publiée pour cette fonction : undefined = on vérifie encore, null = aucune (page d'origine), objet = page en blocs.
export function useFuncPage(id) {
  const { call, ready, user } = useApp();
  const [page, setPage] = useState(undefined);
  useEffect(() => {
    if (!ready) return undefined;
    let dead = false;
    call(`/pages/view?path=${encodeURIComponent('/_func/' + id)}`).then((r) => { if (!dead) setPage(r.ok && r.data?.zones?.main ? r.data : null); }).catch(() => { if (!dead) setPage(null); });
    return () => { dead = true; };
  }, [call, ready, id, user?.id]);
  return page;
}

// sections : { f_<page>_<section>: (props) => nœud } ; order : types dans l'ordre d'origine (ou original : le nœud de la page d'origine quand elle n'est pas une simple suite de sections, ex. des onglets) ; page : résultat de useFuncPage.
export default function FuncPage({ id, page, className, sections, order, original, children }) {
  const { locale } = useApp();
  if (page?.zones?.main) {
    return (
      <main className={`${className} func-blocks`}>
        <FuncCtx.Provider value={{ id, sections }}>
          <BlocksView blocks={page.zones.main} locale={locale} />
        </FuncCtx.Provider>
        {children}
      </main>
    );
  }
  return (
    <main className={className}>
      {original ?? order.map((t) => <Fragment key={t}>{sections[t]?.({})}</Fragment>)}
      {children}
    </main>
  );
}
