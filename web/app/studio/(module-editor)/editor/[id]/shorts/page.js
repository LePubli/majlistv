'use client';
// Studio → Éditeur → « Extraits 9:16 » (étape E5b) — voir web/modules/editor/ShortsPage.js.
import { useParams } from 'next/navigation';
import ShortsPage from '../../../../../../modules/editor/ShortsPage';

export default function StudioEditorShorts() {
  const { id } = useParams();
  return <ShortsPage projectId={String(id)} />;
}
