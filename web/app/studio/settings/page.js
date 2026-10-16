'use client';
// Studio → Paramètres : ma chaîne (page publique, images, présentation) et les outils pédagogiques et éditoriaux
// qui étaient dans l'ancien menu du Studio (quiz, mise en pratique, rappels de révision, ouvrages, collections).
import Link from 'next/link';
import { useApp } from '../../../components/Providers';
import { hasWebModule, MODULE_STUDIO_LINKS } from '../../../lib/modules';
import { ICONS, Icon } from '../../../components/ManageShell';

export default function StudioSettings() {
  const { t, user, feat } = useApp();
  if (!user) return null;
  const staff = user.role === 'moderator' || user.role === 'admin';
  const on = (id) => hasWebModule(id) && feat(id);
  const tools = [
    ['/studio/quiz', t('qzNav'), t('sdToolQuiz'), ICONS.check, on('quiz') && user.role !== 'moderator'],
    ['/studio/practice', t('pzNav'), t('sdToolPractice'), ICONS.heart, on('practice')],
    ['/studio/reminders', t('rmNav'), t('sdToolRem'), ICONS.bell, on('revision') && user.role !== 'moderator'],
    ['/studio/books', t('bkNav'), t('sdToolBooks'), ICONS.doc, on('books') && user.role !== 'moderator'],
    ['/studio/collections', t('colNav'), t('sdToolCol'), ICONS.layers, on('collections') && staff],
    // Entrées ajoutées par de nouveaux modules (champ « studio » de leur fiche).
    ...MODULE_STUDIO_LINKS.filter((l) => l.group !== 'admin' && (!l.roles || l.roles.includes(user.role)) && feat(l.feature)).map((l) => [l.href, t(l.label), '', ICONS[l.icon] || ICONS.doc, true]),
  ].filter((x) => x[4]);
  const channels = on('channels');
  return (
    <main className="studio-page">
      <div className="studio-head"><h1 className="studio-title">{t('sdSettingsTitle')}</h1></div>
      {channels && (
        <section className="sd-card" aria-labelledby="set-ch">
          <h2 id="set-ch">{t('sdMyChannel')}</h2>
          <p className="meta">{t('sdMyChannelText')}</p>
          <Link href="/studio/channel" className="btn">{staff ? t('chNavAll') : t('chNav')}</Link>
        </section>
      )}
      <section aria-labelledby="set-tools">
        <h2 id="set-tools" className="sd-h2">{t('sdTools')}</h2>
        <p className="meta">{t('sdToolsText')}</p>
        <div className="sd-tools">
          {tools.map(([href, name, hint, d]) => (
            <Link key={href} href={href} className="sd-tool">
              <span className="sd-tool-ico"><Icon d={d} /></span>
              <span><b>{name}</b>{hint && <small>{hint}</small>}</span>
            </Link>
          ))}
        </div>
        {tools.length === 0 && <p className="meta">{t('sdNoTools')}</p>}
      </section>
    </main>
  );
}
