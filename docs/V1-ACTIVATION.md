# V1 activation handoff

## Current scope

Text conversations, coach requests, reviews, blocking, reports, and admin oversight. Quick Services remains V2. Private message uploads remain disabled.

## Apply database additions

Run `supabase/v1-launch-additions.sql` in staging SQL Editor. It preserves existing app data and runs in one transaction. It requires existing marketplace core, blocking, and admin-review functions. Do not use the fresh-project bootstrap on an existing database. After staging is confirmed, apply the same file to production before promoting the frontend.

This adds verified review eligibility, safety reports/actions, notification preferences/outbox, and removes the admin-only direct conversation SELECT path. Actual participants retain access; administrators who are also participants can still read their own conversations normally. Admin review RPC records actor, timestamp, reason. Database owners/service-role access is outside application audit guarantees.

## Email delivery (not active by default)

Prepared adapter: Resend, using its official POST /emails API. No subscription or provider account has been created.

1. Choose/verify a sending domain with the email provider. Gmail remains the support inbox.
2. Deploy `supabase/functions/deliver-notifications/index.ts` to staging. The function authenticates a dedicated scheduler secret; configure the function gateway to allow the scheduler request to reach that check.
3. Set SERVER secrets: RESEND_API_KEY, NOTIFICATION_FROM, APP_SITE_URL (stable staging HTTPS origin), NOTIFICATION_DISPATCH_SECRET (random secret), NOTIFICATION_DELIVERY_ENABLED=true. Never put these in VITE variables. Supabase provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
4. Schedule an authenticated POST every 5 minutes using Supabase Cron/Vault; keep the dispatch secret in Vault, not source control or browser code. Only enable the job after sending-domain configuration is ready.
5. Opt in from Account settings. Run the worker with disposable test accounts before production configuration.

The worker skips opted-out users, blocked/removed conversations and already-read message events. Message text is never sent to the provider. Failed jobs retry up to five times and expire from processing after 23 hours to stay within the provider's idempotency window. Check outbox last_error for delivery failures. Admins should separately check Safety reports; reports do not yet email administrators.

## Retention

Ordinary account/conversation records follow existing account deletion. Safety reports survive with reporter_id set null; report descriptions and admin audit actions remain restricted to administrators. No automatic expiry is introduced. The operator must handle requests about retained personal data through support. Reports preserve the submitted description, not an entire conversation snapshot.

## Remaining production configuration

- Deploy the existing delete-my-account Edge Function and verify storage cleanup.
- Set production Supabase Auth Site URL and redirect allowlist; configure custom SMTP for confirmation/reset email.
- Review public/legal/privacy.html and terms.html for operator identity/jurisdiction before public launch; these are initial product notices, not a jurisdiction-specific legal review.
- Set VITE_SHOW_DEMO_COACHES=false on production before its launch deployment. Keep mock data in staging for testing.
- Configure external error monitoring/alerts: no monitoring account or credentials are connected. This package does not claim active incident monitoring.
- Verify backups/recovery match the chosen Supabase plan. No paid plan has been ordered.

## Operations

Admin > Conversations includes Safety reports. Filter Open/Reviewing/Resolved, select a report, record action, save. To inspect messages use Conversation oversight with a recorded reason. Outbox failures are server-only; inspect them in Supabase. Never give a browser a service-role key.

Rollback frontend via prior Vercel deployment. Keep additive database tables; do not drop safety/audit records during rollback. The audited admin SELECT restriction may require keeping the new admin UI or restoring the earlier policy in a deliberate rollback.

## November 22 implementation update

- Operator confirmed: Carinne Tzurdecker, Alpharetta, Georgia, United States. Notices updated.
- No owned sending domain yet. Notification emails and custom Auth SMTP remain inactive.
- Public endpoint probes returned 404 for delete-my-account and deliver-notifications in both Supabase projects. Deployment remains required; no actual account deletion was attempted.
- Anonymous safety-report SELECT was denied (401) in both projects.
- Real reviews/replies now fail on backend errors instead of saving locally. The UI checks eligibility before enabling review creation. Database acceptance history remains the authority.
- Account photo cleanup supports batches and nested folders, with tests for cross-user isolation.
- Production directory excludes static mock coaches; staging retains them.
- .github/workflows/checks.yml runs tests/build on pushes and pull requests.
- .github/workflows/availability.yml checks the production app shell and JavaScript hourly once merged into the default branch. GitHub schedules may be delayed. Enable Actions failure notifications in the repository owner's GitHub notification settings. This does not capture all browser/runtime errors or replace database monitoring.
- A recoverable error screen is installed for rendering failures. Browser errors currently log to the browser console; centralized runtime alerting is still not configured.
- Client photo objects are still publicly served; privacy notice now states that explicitly. Text conversations use database access controls.

Supabase dashboard sign-in is required before the agent can deploy the pending Edge Functions, inspect Auth email delivery and recovery configuration, or run cross-account backend walkthroughs. No service-role credential is available to the agent, and none is requested in chat.
