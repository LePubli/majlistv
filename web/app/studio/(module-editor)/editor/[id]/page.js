'use client';
// Studio → Éditeur → un projet de montage (plein écran) — voir web/modules/editor/Editor.js.
import { useParams } from 'next/navigation';
import Editor from '../../../../../modules/editor/Editor';

export default function StudioEditorProject() {
  const { id } = useParams();
  return <Editor id={String(id)} />;
}
