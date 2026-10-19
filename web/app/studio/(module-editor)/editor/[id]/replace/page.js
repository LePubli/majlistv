'use client';
// Studio → Éditeur → « Remplacer la vidéo publiée » (étape E4b) — voir web/modules/editor/ReplacePage.js.
import { useParams } from 'next/navigation';
import ReplacePage from '../../../../../../modules/editor/ReplacePage';

export default function StudioEditorReplace() {
  const { id } = useParams();
  return <ReplacePage projectId={String(id)} />;
}
