'use client';
// « En direct » (étape N1 du 15/11) : onglet du Catalogue qui réunit la TV 24 h/24 (fonction « livetv » : chaînes YouTube gérées
// dans Studio → TV en direct, lecteur YouTube officiel du direct en cours) et les prochains événements en direct (fonction
// « events », page /events). La TV reste indépendante du module « Événements en direct » : chaque partie suit sa propre fonction.
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import LiveChannels from '../../components/LiveChannels';
import EventsBand from '../../components/EventsBand';

export default function LiveTvPage() {
  const { t, feat, user } = useApp();
  if (!feat('livetv')) return <main className="page"><p className="meta">{t('lvAdminOff')}</p></main>;
  const events = feat('events');
  return (
    <main className="page lv-page">
      <h1>{t('stLive')}</h1>
      <p className="meta">{events ? t('lvHubIntro') : t('lvPageIntro')}</p>
      <LiveChannels
        empty={(
          <p className="soon">
            {t('lvNoChannel')}
            {user?.role === 'admin' && <> <Link className="link u" href="/studio/live">{t('lvAddHint')}</Link></>}
          </p>
        )}
      />
      {events && <EventsBand empty={<p className="lv-ev-more"><Link className="link u" href="/events">{t('evnMore')}</Link></p>} />}
    </main>
  );
}
