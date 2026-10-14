import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
if (existsSync('.env')) process.loadEnvFile('.env');

// Hosting providers tell the app its own public address; use it when BETTER_AUTH_URL is not set by hand.
if (!process.env.BETTER_AUTH_URL?.trim()) {
  const fromHost =
    process.env.RENDER_EXTERNAL_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN && `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`) ||
    (process.env.FLY_APP_NAME && `https://${process.env.FLY_APP_NAME}.fly.dev`);
  if (fromHost) process.env.BETTER_AUTH_URL = fromHost;
}
for (const key of ['DATABASE_URL','BETTER_AUTH_SECRET','BETTER_AUTH_URL']) {
  if (!process.env[key]?.trim()) throw new Error(`Set ${key} before starting the shared server. Use npm run dev for local development.`);
}
if (!process.env.BETTER_AUTH_URL.startsWith('https://')) throw new Error('Set BETTER_AUTH_URL to the public HTTPS address.');
if (process.env.KAMINO_REQUIRE_EMAIL_VERIFICATION !== 'false' && (!process.env.RESEND_API_KEY?.trim() || !process.env.MAIL_FROM?.trim())) {
  throw new Error('Configure RESEND_API_KEY and MAIL_FROM so members can confirm their email before signing in.');
}
if (!existsSync('.output/server/index.mjs')) throw new Error('Run npm run build first.');

// Apply any database changes that are still pending. Safe to repeat: each change runs only once.
const migrate = spawnSync(process.execPath, ['scripts/migrate.mjs'], { stdio: 'inherit', env: process.env });
if (migrate.status !== 0) throw new Error('Database migration failed; not starting the server.');

const child=spawn(process.execPath,['.output/server/index.mjs'],{stdio:'inherit',env:{...process.env,NODE_ENV:'production'}});
const worker=process.env.KAMINO_JOB_SECRET ? spawn(process.execPath,['scripts/notification-worker.mjs'],{stdio:'inherit',env:process.env}) : null;
if(!worker) console.warn('Set KAMINO_JOB_SECRET to enable background reminders and weekly digests.');
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{child.kill(signal);worker?.kill(signal);});
child.on('exit',code=>{worker?.kill();process.exit(code??1);});
