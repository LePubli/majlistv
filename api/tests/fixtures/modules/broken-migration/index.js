export default async function register(app) { app.get('/broken-migration/x', async () => ({ ok: true })); }
