import { pool } from '../../../../src/db.js';
export default async function register(app, ctx) {
  app.get('/hello-demo/hi', async () => {
    const n = (await pool.query('SELECT count(*)::int AS n FROM hello_demo_rows')).rows[0].n;
    return { greeting: await ctx.setting('greeting'), times: Number(await ctx.setting('times')), rows: n, version: ctx.version };
  });
}
