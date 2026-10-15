'use client';
// Page d'une chaîne (étape C) : en-tête (nom, abonnés, Suivre), présentation, puis onglets Conférences / Séries.
// `initial` (lu côté serveur) est dans le HTML dès le premier octet et affiché pendant le chargement des vignettes.
import { useEffect, useState } from 'react';
import { useApp } from './Providers';
import TalkCard from './TalkCard';
import SeriesCard from './SeriesCard';
import FollowButton from './FollowButton';
import Crumbs from './Crumbs';
import ChannelAvatar from './ChannelAvatar';
import { TabBar, TabPanel, useTab } from './Tabs';

export default function ChannelClient({ slug, initial }) {
  const { t, call, ready, user, feat } = useApp();
  const [talks, setTalks] = useState(null);
  const [info, setInfo] = useState(null); // { series, followers }
  useEffect(() => {
    if (!ready) return;
    call(`/talks?speaker=${slug}&limit=100`).then((r) => setTalks(r.ok ? r.data : []));
    call(`/channels/${slug}`, {}, null).then((r) => setInfo(r.ok ? r.data : { series: [], followers: 0 }));
  }, [slug, call, ready, user]);
  const series = info?.series ?? [];
  const tabs = [{ id: 'talks', label: t('spTalks') }, ...(series.length > 0 ? [{ id: 'series', label: t('spSeries') }] : [])];
  const [tab, go] = useTab(tabs);
  const followers = info?.followers || 0;
  return (
    <main className="spk-page ch-page">
      <Crumbs items={[['/chaines', t('spTitle')], [null, initial.name]]} />
      {initial.bannerUrl && <div className="ch-banner"><img src={initial.bannerUrl} alt="" /></div>}
      <header className={`ch-head${initial.bannerUrl ? ' has-banner' : ''}`}>
        <ChannelAvatar name={initial.name} url={initial.avatarUrl} size="lg" />
        <div className="ch-head-text">
          <h1>{initial.name}</h1>
          <p className="meta">{t(initial.talks.length > 1 ? 'chTalksN' : 'chTalks1').replace('{n}', initial.talks.length)}{followers > 0 && ` · ${t(followers > 1 ? 'chFolN' : 'chFol1').replace('{n}', followers)}`}</p>
        </div>
        {feat('follow') && <div className="spk-follow"><FollowButton slug={slug} t={t} call={call} user={user} /></div>}
      </header>
      {initial.bio && <p className="spk-bio">{initial.bio}</p>}
      {tabs.length > 1 && <TabBar tabs={tabs} current={tab} onChange={go} label={t('tbLabel')} />}
      <TabPanel id="talks" current={tab}>
        {tabs.length === 1 && <h2>{t('spTalks')}</h2>}
        {talks === null ? (
          <ul className="spk-plain">{initial.talks.map((x) => <li key={x.id}><a href={`/conferences/${x.slug}`}>{x.title}</a></li>)}</ul>
        ) : (
          <div className="grid">{talks.map((x) => <TalkCard key={x.id} talk={x} t={t} />)}</div>
        )}
      </TabPanel>
      <TabPanel id="series" current={tab}>
        <div className="grid">{series.map((x) => <SeriesCard key={x.id} series={x} t={t} />)}</div>
      </TabPanel>
    </main>
  );
}
