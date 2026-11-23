// Page d'essai de l'écran Admin → Apparence (onglets « Typographies » et « Composants »).
// Elle ne montre que des exemples fixes avec les classes du site : l'administration l'ouvre dans son aperçu et y applique le brouillon du thème.
// ?s=typo  : échelle des textes avec les polices du thème ; ?s=compo : boutons, badges, onglets, champs, cartes.
export const metadata = { title: 'Aperçu du thème', robots: { index: false, follow: false } };

const SAMPLE = 'Des conférences qui éclairent : apprendre, comprendre, retenir et mettre en pratique.';

function Typo() {
  return (
    <main style={{ padding: '28px 20px', display: 'grid', gap: 22, maxWidth: 860, margin: '0 auto' }} aria-label="Textes">
      <section className="panel">
        <small className="muted">Titre principal (police des titres)</small>
        <h1 style={{ margin: 0 }}>Des conférences qui éclairent</h1>
        <small className="muted">Titre de section</small>
        <h2 style={{ margin: 0 }}>Nos univers à explorer</h2>
        <small className="muted">Sous-titre</small>
        <h3 style={{ margin: 0 }}>Série de cours : les fondements</h3>
      </section>
      <section className="panel">
        <small className="muted">Texte courant (police du texte)</small>
        <p style={{ margin: 0 }}>{SAMPLE} Une phrase plus longue permet de juger la lecture : chaque vidéo propose un résumé, des chapitres, un quiz et des cartes de révision pour garder l’essentiel dans la durée.</p>
        <small className="muted">Texte secondaire</small>
        <p style={{ margin: 0, color: 'var(--text-2)' }}>{SAMPLE}</p>
        <small className="muted">Texte atténué</small>
        <p style={{ margin: 0, color: 'var(--muted)' }}>Publié le 12 novembre · 48 min · Français</p>
        <small className="muted">Lien et mention dorée</small>
        <p style={{ margin: 0 }}><a href="#typo" style={{ color: 'var(--accent-light)' }}>Voir toutes les conférences</a></p>
      </section>
      <section className="panel" dir="rtl" lang="ar">
        <small className="muted" dir="ltr">Arabe (de droite à gauche)</small>
        <h2 style={{ margin: 0 }}>محاضرات تنير الطريق</h2>
        <p style={{ margin: 0 }}>نتعلم ونفهم ونحفظ ونطبق ما تعلمناه في حياتنا اليومية.</p>
      </section>
    </main>
  );
}

function Compo() {
  return (
    <main style={{ padding: '28px 20px', display: 'grid', gap: 18, maxWidth: 860, margin: '0 auto' }} aria-label="Composants">
      <section className="panel">
        <h3 className="panel-title">Boutons</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button type="button" className="btn">Regarder</button>
          <button type="button" className="btn ghost">Plus tard</button>
          <button type="button" className="btn danger">Supprimer</button>
          <button type="button" className="btn" disabled>Indisponible</button>
        </div>
      </section>
      <section className="panel">
        <h3 className="panel-title">Badges et pastilles</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <span className="badge-inline">NOUVEAU</span>
          <span className="badge-inline">48 MIN</span>
          <span className="pills"><button type="button" className="pill on">Tout</button><button type="button" className="pill">Cours</button><button type="button" className="pill">Récitations</button></span>
        </div>
      </section>
      <section className="panel">
        <h3 className="panel-title">Onglets</h3>
        <div className="tabs" role="tablist" style={{ display: 'flex', gap: 18, borderBottom: '1px solid var(--line-soft)' }}>
          <button type="button" className="on" role="tab" aria-selected="true" style={{ background: 'none', border: 0, borderBottom: '2px solid transparent', padding: '8px 2px', font: 'inherit', cursor: 'pointer' }}>À propos</button>
          <button type="button" role="tab" aria-selected="false" style={{ background: 'none', border: 0, borderBottom: '2px solid transparent', padding: '8px 2px', font: 'inherit', cursor: 'pointer' }}>Mes notes</button>
          <button type="button" role="tab" aria-selected="false" style={{ background: 'none', border: 0, borderBottom: '2px solid transparent', padding: '8px 2px', font: 'inherit', cursor: 'pointer' }}>Questions</button>
        </div>
      </section>
      <section className="panel">
        <h3 className="panel-title">Champs de formulaire</h3>
        <label style={{ display: 'grid', gap: 6 }}>Adresse e-mail<input type="email" placeholder="vous@exemple.fr" /></label>
        <label style={{ display: 'grid', gap: 6 }}>Langue<select defaultValue="fr"><option value="fr">Français</option><option value="en">English</option></select></label>
        <label style={{ display: 'grid', gap: 6 }}>Message<textarea rows={3} placeholder="Votre message…" /></label>
      </section>
      <section className="panel">
        <h3 className="panel-title">Cartes et panneaux</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          {['Les fondements', 'La vie du Prophète', 'Comprendre le Coran'].map((t) => (
            <div key={t} style={{ background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius)', padding: 16 }}>
              <b>{t}</b>
              <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 14 }}>12 épisodes · 8 h</p>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <h3 className="panel-title">Messages</h3>
        <p className="error" style={{ margin: 0 }}>Une erreur : vérifiez l’adresse saisie.</p>
        <p className="adm-ok" style={{ margin: 0 }}>Enregistré : vos réglages sont à jour.</p>
      </section>
    </main>
  );
}

export default function Page({ searchParams }) {
  return searchParams?.s === 'compo' ? <Compo /> : <Typo />;
}
