# Weightlisted authentication email

The hosted Supabase dashboard does not automatically load this file. It is the approved source for the confirmation email template.

1. In Supabase, open **Authentication → Email Templates → Confirm signup**.
2. Set the subject to `Confirm your Weightlisted account` and paste the contents of `confirm-signup.html` into the message body.
3. In **Authentication settings**, configure a custom SMTP provider and use a verified sender such as `hello@weightlisted.com` with sender name `Weightlisted`. This is what removes both **Supabase Auth** and `mail.app.supabase.io` from the inbox header.
4. Set the production site URL and add it to the redirect URL allow list so email confirmations return to the deployed Weightlisted app.

Make is not required. Supabase sends the authentication email directly; a custom SMTP service is the normal production setup. Keep click-tracking disabled for auth emails so the confirmation link is not rewritten.
