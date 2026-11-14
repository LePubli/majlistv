'use client';
// TV en direct (fonction « livetv », indépendante des événements en direct depuis le 14/11) : chaînes YouTube 24 h/24
// (ex. La Mecque, Médine) gérées dans Studio → TV en direct ; lecteur YouTube officiel du direct en cours.
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import LiveChannels from '../../components/LiveChannels';

export default function LiveTvPage() {
  const { t, feat, user } = useApp();
  if (!feat('livetv')) return <main className="page"><p className="meta">{t('lvAdminOff')}</p></main>;
  return (
    <main className="page lv-page">
      <h1>{t('lvNav')}</h1>
      <p className="meta">{t('lvPageIntro')}</p>
      <LiveChannels
        empty={(
          <p className="soon">
            {t('lvNoChannel')}
            {user?.role === 'admin' && <> <Link className="link u" href="/studio/live">{t('lvAddHint')}</Link></>}
          </p>
        )}
      />
    </main>
  );
}
