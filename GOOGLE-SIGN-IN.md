# Google sign-in setup

Google sign-in is disabled by default because the production Supabase project's Google provider is not configured. Email/password sign-in remains available. The button is enabled only when `VITE_GOOGLE_AUTH_ENABLED=true` is set at build time **after** the provider has been configured and tested.

1. In Google Cloud, configure the OAuth consent screen and create an OAuth **Web application** client. Follow Google's current publishing and verification requirements.
2. In Supabase Dashboard → Authentication → Sign In / Providers → Google, enable Google and configure the client ID and secret there. Never put the secret in the repository, a Vite variable, or chat.
3. Register the callback URL shown by Supabase in the Google OAuth client as an authorized redirect URI. The project's callback is `https://xzwegezqfmfxrlxrzawl.supabase.co/auth/v1/callback`. Confirm it in the dashboard before saving.
4. In Supabase Authentication → URL Configuration, allow the site's `/account` callback URL for each actual domain used. Do not add broad or untrusted preview domains. The website sends users back to the current origin's `/account`.
5. Set the public build variable `VITE_GOOGLE_AUTH_ENABLED=true` in the intended Vercel environment and redeploy. This flag is not a credential.
6. Test a new Google account and a returning account on the real domain, including a missing phone/country, valid completion, sign out/in, and the existing email login. If anything fails, set the flag to false and redeploy.

Google supplies the authenticated email and typically the name; the site asks the customer to complete their profile with a contact number and country after authentication. Creating the Google identity happens before profile completion. The completion form blocks the account dashboard until those fields have been saved, but it is not a verification of phone ownership.
