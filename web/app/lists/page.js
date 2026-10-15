// Étape B : « Mes listes » est devenu un onglet de la bibliothèque. L'ancienne adresse y renvoie.
import { redirect } from 'next/navigation';

export default function MyLists() {
  redirect('/library?tab=lists');
}
