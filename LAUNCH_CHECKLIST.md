# Weightlisted launch checklist

This app should stay a single product with one account and three permissioned views:

- Client: discover coaches, request ongoing coaching, use Quick Services, message, and manage a profile.
- Coach: available only after an administrator approves the coach application; manage public profile, client requests, messages, and Quick Services.
- Owner/admin: review applications and view marketplace activity. Backend authorization comes from Supabase row-level security, not from a hidden URL or browser-only PIN.

## What is already built

- Supabase email/password accounts and private client profiles.
- Coach application, approval, directory, coach workspace, and owner role switching.
- Backend-ready conversation and Quick Service records with participant/admin access policies.
- Coach-managed public profiles that persist to Supabase.
- Admin marketplace oversight for coaching requests, active clients, payment-pending requests, and active services.
- Manual `City, ST` and gym entry. Google Places is optional, not required.
- Leaflet map with basemap attribution.

## Do these before inviting real users

1. Back up the Supabase project.
2. In Supabase SQL Editor, run the migrations in order:
   - `supabase/migrations/20260923000000_coach_reviews.sql` (if the `coach_reviews` table is not already present)
   - `supabase/migrations/20261102000000_founder_and_coach_profiles.sql`
   - `supabase/migrations/20261102010000_marketplace_core.sql`
   - `supabase/migrations/20261102020000_coach_profile_exact_location.sql`
   - `supabase/migrations/20261102030000_coach_gym_zip.sql`
   - `supabase/migrations/20261102040000_review_reply_threads.sql`
   - Existing projects that predate the private admin allowlist can rerun the first migration safely; it now creates the missing `private.admin_allowlist` table before adding owner emails.
3. Confirm the owner account email. The current server-side allowlist contains:
   - `carinnetz@gmail.com`
   - `ctzurdecker@outlook.com`
   - `getweightlisted@gmail.com`
4. Sign out and back in with the owner account, then verify User View, Coach View preview, and Admin View. Only an actually approved coach receives coach backend permissions; owner preview does not impersonate a coach in the database.
5. In Supabase Authentication > URL Configuration, set the production Site URL and add the production and local redirect URLs.
6. Configure custom SMTP for sign-up confirmation and password reset. Supabase's default mailer is only for testing. A free Resend account is enough to begin; verify a sending domain and use a separate address such as `no-reply@auth.yourdomain.com`.
7. Test with three separate accounts/browsers:
   - Client creates an account and sends a coaching request.
   - Coach applies; owner approves the application.
   - Approved coach sees the request, accepts or declines it, and replies.
   - Owner sees the activity in Admin View.
8. Add production payments before enabling the Quick Service checkout button. Recommended: Stripe Checkout + Connect Express/Standard, application fees, webhook-confirmed payment, and payout only after completion/refund rules are satisfied. Never mark a request paid from the browser.
9. Add private media uploads before relying on form-review videos. Store objects in a private Supabase Storage bucket and issue short-lived signed URLs to the client, assigned coach, and admin only.
10. Add Terms, Privacy, refund/cancellation rules, coach agreement, content/reporting rules, and a support contact. Have a qualified professional review coach classification, insurance, taxes, and health/fitness disclaimers.

## Location plan that avoids a new bill

Use the current manual flow at launch:

- Coach enters gym name plus `City, ST` and a five-digit ZIP; a public street address is not required.
- A coach who is physically at the gym can save a precise one-time browser GPS pin without a paid place-search subscription.
- Online-only coaches do not need a gym.
- The map can place manual entries at a regional/state fallback until an exact coordinate is available.
- Clients search by city, state, ZIP, gym name, and coach specialty.

Do not buy Google Places yet. Enable it later only if users are entering duplicate or ambiguous gym branches often enough to hurt matching. The existing code already supports an optional `VITE_GOOGLE_MAPS_API_KEY`; if it is absent, manual entry remains available.

## Keep / postpone / avoid

### Keep now

- Supabase for auth, Postgres, row-level security, realtime, and small profile images.
- Current static hosting while traffic is small.
- Cal.com Individual for the one founder interview calendar; it is free for one user.
- Manual locations and the existing Leaflet map.

### Add when the workflow is proven

- Stripe Connect for real Quick Service payments and coach payouts.
- Private video storage with upload limits, retention, and deletion.
- Transactional email templates and notification preferences.
- Exact gym/place search if manual location quality becomes a real support problem.
- Error monitoring, database backups, and a paid Supabase plan immediately before a public launch that needs uptime.

### Avoid for now

- A second backend, separate coach login system, paid CRM, paid chat provider, paid scheduling team plan, or paid Google map plan.
- Storing messages or business records only in `localStorage`.
- Public media buckets for client videos.
- Client-side admin secrets or admin PINs.

## Recommended rollout

1. Private founder test.
2. Two invited coaches and five invited clients.
3. Manually supervise every request and payment for the pilot.
4. Fix the places where users get confused.
5. Turn on automated payment/payout only after the request, acceptance, completion, refund, and dispute rules are settled.
6. Move Supabase to a production plan and enable backups before broader promotion.
