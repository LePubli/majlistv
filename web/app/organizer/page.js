import { redirect } from 'next/navigation';

// Ancienne adresse de l'espace organisateur : redirigée vers le Studio.
export default function Organizer() {
  redirect('/studio');
}
