# Google sign-in setup

Google sign-in is deferred: the account page has no Google sign-in button. Email/password sign-in remains available. Enabling a provider or setting an environment variable alone will not restore the option; the website sign-in flow must be implemented and tested again when the feature is resumed. The contact-completion handling for any existing Google identities is retained.

1. In Google Cloud, configure the OAuth consent screen and create an OAuth **Web application** client. Follow Google's current publishing and verification requirements.
2. In Supabase Dashboard → Authentication → Sign In / Providers → Google, enable Google and configure the client ID and secret there. Never put the secret in the repository, a Vite variable, or chat.
3. Register the callback URL shown by Supabase in the Google OAuth client as an authorized redirect URI. The project's callback is `https://xzwegezqfmfxrlxrzawl.supabase.co/auth/v1/callback`. Confirm it in the dashboard before saving.
4. In Supabase Authentication → URL Configuration, allow the site's `/account` callback URL for each actual domain used. Do not add broad or untrusted preview domains. The website sends users back to the current origin's `/account`.
5. Restore and test a Google sign-in entry point in the website before enabling it for customers. Test new and returning accounts on the real domain, including contact completion, sign out/in, and email login.

Google supplies the authenticated email and typically the name; the site asks the customer to complete their profile with a contact number and country after authentication. Creating the Google identity happens before profile completion. The completion form blocks the account dashboard until those fields have been saved, but it is not a verification of phone ownership.
