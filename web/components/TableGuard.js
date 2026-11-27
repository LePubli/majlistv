'use client';
// Garde-fou : dans le Studio et l'Admin, tout tableau de plus de 25 lignes qui n'est pas déjà paginé (data-paged) est découpé en pages
// automatiquement. Il rattrape les écrans qui oublieraient d'utiliser usePaged / <Pager> (règle du projet : jamais de liste interminable).
// Les lignes au-delà de la page sont masquées (attribut hidden), pas supprimées : cases à cocher et état React restent intacts.
import { useEffect } from 'react';

const SIZE = 25;

function guard(table, labels) {
  if (table.closest('[data-paged]') || table.dataset.noGuard) return;
  const body = table.tBodies[0];
  if (!body) return;
  const rows = [...body.rows];
  let st = table._pg;
  if (!st) {
    st = table._pg = { page: 0 };
    const bar = document.createElement('div');
    bar.className = 'pg-bar pg-guard';
    table.after(bar);
    st.bar = bar;
  }
  if (rows.length <= SIZE) { st.bar.hidden = true; rows.forEach((r) => { r.hidden = false; }); return; }
  const pages = Math.ceil(rows.length / SIZE);
  st.page = Math.min(st.page, pages - 1);
  rows.forEach((r, i) => { r.hidden = Math.floor(i / SIZE) !== st.page; });
  st.bar.hidden = false;
  st.bar.innerHTML = '';
  const range = document.createElement('span');
  range.className = 'pg-range';
  range.textContent = labels.range.replace('{a}', st.page * SIZE + 1).replace('{b}', Math.min(rows.length, (st.page + 1) * SIZE)).replace('{n}', rows.length);
  const ctrl = document.createElement('span');
  ctrl.className = 'pg-ctrl';
  const mk = (txt, d, off) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pg-btn'; b.textContent = txt; b.disabled = off;
    b.onclick = () => { st.page += d; guard(table, labels); };
    return b;
  };
  const num = document.createElement('span');
  num.className = 'pg-num'; num.textContent = `${st.page + 1} / ${pages}`;
  ctrl.append(mk(`‹ ${labels.prev}`, -1, st.page <= 0), num, mk(`${labels.next} ›`, 1, st.page >= pages - 1));
  st.bar.append(range, ctrl);
}

export default function TableGuard({ labels }) {
  useEffect(() => {
    let timer = null;
    const run = () => { timer = null; document.querySelectorAll('main table').forEach((t) => guard(t, labels)); };
    const mo = new MutationObserver((m) => {
      // on ignore nos propres changements (barre et attribut hidden) pour ne pas boucler
      if (m.every((x) => x.target.classList?.contains('pg-guard') || x.target.closest?.('.pg-guard') || x.attributeName === 'hidden')) return;
      if (!timer) timer = setTimeout(run, 120);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    run();
    return () => { mo.disconnect(); if (timer) clearTimeout(timer); };
  }, [labels]);
  return null;
}
