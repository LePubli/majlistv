// Module « Événements en direct » (amélioration 4.2).
import routes from './routes.js';
import { startEventReminders } from './reminders.js';

export default async function register(app) {
  await app.register(routes);
}

// Rappels aux inscrits (notification et e-mail) : un passage toutes les 5 minutes.
export async function start(app) { startEventReminders(app.log); }
