# WhatsApp Desk — setup guide

The CRM has a **WhatsApp** tab: your business WhatsApp inbox inside the CRM,
with AI reply drafts and an optional AI auto-reply agent. It uses Meta's
official **WhatsApp Business Cloud API** — the only WhatsApp automation that
cannot get your number banned.

## Honest cost summary (read this first)

| Thing | Cost |
|---|---|
| Creating the Meta app + Cloud API number | Free |
| **Receiving** customer messages | Free |
| **Replying** within 24 h of the customer's last message (a "service conversation") | **Free** |
| **Starting** a conversation (template message, after 24 h of silence) | Paid per message, billed by Meta |
| WhatsApp **voice calls** | Free — but made from the WhatsApp app on a phone (the wa.me links in the Call desk), not through this API |

The desk only ever sends free-form replies inside the 24-hour window. It has
no template-sending button, so it can never silently run up a Meta bill.

## What you need

1. A **Meta Business Manager** account (business.facebook.com) — free.
2. A **phone number that is NOT registered on consumer WhatsApp**. Meta gives
   every new Cloud API app a free **test number** you can use immediately;
   for production use a spare SIM/landline number you can receive a
   verification call/SMS on.
3. Your Vercel project (where the site runs).

## Step-by-step

### 1. Create the app
- developers.facebook.com → **Create app** → type "Business".
- In the app dashboard, add the **WhatsApp** product.
- Meta creates a test number and shows the **Phone number ID** — note it.

### 2. Create a permanent token
- Business settings → **System users** → add one (admin role).
- Generate a token with the `whatsapp_business_messaging` and
  `whatsapp_business_management` permissions, **never-expiring**.
- This is `WHATSAPP_TOKEN`.

### 3. Set the Vercel environment variables
In Vercel → Project → Settings → Environment Variables (Production):

| Name | Value |
|---|---|
| `WHATSAPP_TOKEN` | the permanent system-user token |
| `WHATSAPP_PHONE_ID` | the Phone number ID (a long number, not the phone number itself) |
| `WHATSAPP_VERIFY_TOKEN` | any long random string you invent (e.g. 40 random characters) |

Redeploy after saving.

### 4. Register the webhook
In the Meta app dashboard → WhatsApp → **Configuration** → Webhook:

- **Callback URL:**
  `https://ar7traders.com/api/leads?wa=webhook&key=<your WHATSAPP_VERIFY_TOKEN>`
- **Verify token:** the same `WHATSAPP_VERIFY_TOKEN` value.
- Press **Verify and save** — Meta sends a GET handshake; the site answers it.
- Subscribe to the **messages** webhook field.

### 5. Test it
Send a WhatsApp message to the business/test number. Within seconds it
appears in CRM → WhatsApp. Type a reply (or press **AI draft**) and send.

## The AI agent

- **AI draft** (always available): the same Gemini key that powers the
  on-site assistant writes a suggested reply from the conversation and your
  live stock. A person reviews and presses Send. With no `GEMINI_API_KEY`,
  an honest canned draft is offered instead.
- **AI auto-reply** (owner switch, default OFF): CRM → WhatsApp →
  "AI auto-reply" toggle (needs the settings permission). When ON, the AI
  answers new inbound messages by itself and signs as "AI agent" in the
  thread. Keep an eye on it; switch it off any time. It follows the same
  honesty rules as the site assistant: it never invents prices or duty rates.

## What this deliberately does not do

- **No paid template blasts** — cold outreach runs through the Prospects tab
  → convert to lead → Call desk (your phone/WhatsApp, free).
- **No AI voice calls** — real AI telephony needs a paid provider (Twilio
  etc.) and per-country robocall consent. The free alternatives are the
  Call desk's wa.me voice calls and the browser **Web call** rooms.
- **No free virtual UK/JP/CN numbers** — they do not exist. Cheapest real
  option is a UK number (~US$1–1.5/month + per-minute via Twilio/Sonetel);
  Japanese numbers require a verified Japanese address; Chinese numbers are
  effectively unavailable to foreign businesses. The WhatsApp number IS the
  free international line — it works for every country a customer is in.
