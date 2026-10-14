import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
// The ZIP also contains tests of its original app-generator environment.
// Keep those runnable explicitly without treating platform fixtures as Kamino requirements.
const files=process.argv.includes('--legacy')
  ? readdirSync('scripts').filter(f=>f.endsWith('.test.mjs')).map(f=>'scripts/'+f)
  : ['scripts/sign-out-plan.test.mjs'];
files.push('scripts/kamino-pwa.test.mjs','scripts/backup-lib.test.mjs','src/lib/app-data/app-data.test.ts','src/lib/app-data/readiness-schedule.test.ts','src/lib/auth/phone-safe-two-factor.test.ts','src/lib/auth/mobile-oauth-state.test.ts','src/lib/auth/safe-redirect.test.ts','src/lib/auth/gate-identity.test.ts','src/lib/auth/sign-in-gate.test.ts','src/lib/kamino/feeds.test.ts','src/lib/kamino/rate-limit.test.ts','src/lib/kamino/age.test.ts','src/lib/kamino/ice.test.ts','src/lib/kamino/stickers.test.ts','src/lib/kamino/cosmetics.test.ts','src/lib/kamino/albums.test.ts','src/lib/kamino/theme.test.ts','src/lib/kamino/sigv4.test.ts','src/lib/kamino/media-store.test.ts','src/lib/kamino/moderation.test.ts','src/lib/kamino/roleplay.test.ts','src/lib/kamino/ai.test.ts','src/lib/format-ui.test.ts','src/components/home/home-data.test.ts','src/components/profile/helpers.test.ts','src/lib/kamino/ai.test.ts','src/lib/kamino/achievements.test.ts','src/lib/kamino/social-rules.test.ts','src/lib/kamino/content-rules.test.ts','src/lib/kamino/community-v9-rules.test.ts');
files.push('src/lib/kamino/billing-rules.test.ts','src/lib/kamino/billing.server.test.ts','src/lib/kamino/paid-post-policy.test.ts','src/lib/kamino/notification-target-sql.test.ts','src/lib/kamino/premium.server.test.ts');
files.push('src/lib/kamino/platform-flag-rules.test.ts');
files.push('src/lib/kamino/site-reports.server.test.ts');
files.push('src/lib/kamino/report-rules.test.ts');
files.push('src/lib/kamino/platform-analytics.server.test.ts');
files.push('src/lib/kamino/privacy-v9.server.test.ts','src/lib/kamino/profile-stories.server.test.ts');
files.push('src/lib/kamino/media-deletion.server.test.ts');
files.push('src/lib/kamino/media-v10-rules.test.ts','src/lib/kamino/media-v10.server.test.ts','src/lib/kamino/event-time-v10.test.ts','src/lib/kamino/social-events-v10.server.test.ts','src/lib/kamino/search-v10.server.test.ts');
files.push('src/lib/kamino/operations-v10.server.test.ts');
files.push('src/lib/kamino/shelf.test.ts','src/lib/kamino/referrals.server.test.ts');
files.push('src/lib/kamino/money.server.test.ts','src/lib/kamino/media-jobs.server.test.ts');
files.push('src/lib/i18n/i18n.test.ts');
const result=spawnSync(process.execPath,['--experimental-strip-types','--test','--test-concurrency=2',...new Set(files)],{stdio:'inherit'});
process.exit(result.status??1);
