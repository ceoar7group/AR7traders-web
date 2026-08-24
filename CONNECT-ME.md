# How to connect me to Vercel and Supabase

Short answer: **you connect them to GitHub once, and that connects them to me.**

You do not have to keep coming back to do this. It is a one-time setup of
about 10 minutes, and after that everything I build appears on your live site
by itself.

---

## Why I can't just log in myself

My workspace is sealed off from the internet except for GitHub. I tested it
again just now:

| Service | Can I reach it? |
|---|---|
| GitHub | Yes |
| Vercel | No — blocked |
| Supabase | No — blocked |

This is a deliberate safety boundary around the machine I run on, not a
password problem. **Sending me a login, a key, or a token would not help** —
the connection is blocked before any password is ever checked. Please don't
send me one; a key pasted into a chat has to be treated as leaked and
replaced.

---

## The trick: GitHub is the bridge

Vercel has a built-in feature where it watches a GitHub repository and
rebuilds your site automatically whenever the code changes.

I **can** push to GitHub. So:

```
I push to GitHub  ->  Vercel notices  ->  your live site updates
```

You link Vercel to GitHub **once**. From then on, when you ask me for a
change, I push it and your website updates on its own in about a minute. You
don't have to do anything.

That is as close to "connected to me" as it is possible to get, and honestly
it is the setup you want anyway — it is how professional teams deploy.

---

## What you do, once

Follow **`GO-LIVE-COPY-PASTE.md`**. It is written as copy-paste steps. The
part that creates the permanent link is Step 2, where you pick
`ceoar7group/AR7traders-web` from the list on **vercel.com/new**.

Two things in that step decide whether the automatic updates work:

1. **Set the branch to `arena/01a0334a-ar7traders-web`.** This is where all my
   work is. If you leave it on `main`, you will deploy an old version of the
   site and none of my future changes will show up.

2. **Add all seven environment variables before pressing Deploy.** If the two
   starting with `VITE_` are missing, the site still deploys and looks
   completely normal — but the CRM is silently stripped out and `/#crm` shows
   "SUPABASE CONNECTION REQUIRED" forever. There is no error message warning
   you. This catches people out, so it is worth double-checking.

Supabase is a little different: it has no equivalent auto-connect. But it only
needs setting up **once** (Step 1, pasting the SQL file). After that I never
need to touch it again — everything day-to-day is edited through your CRM, not
through Supabase.

---

## How you'll ask for changes afterwards

Just tell me in plain words, the same as always:

> "Add Saudi Arabia to the world map"
> "Change the phone number in the footer"

I make the change, push it, and it is live in about a minute. If you want to
be certain a change has gone out, open your Vercel dashboard — there is a
list of deployments with a green tick next to each finished one.

---

## If you would rather not do it yourself

Any of these people can do the 10 minutes for you, and none of them need to
understand the code:

- whoever set up your current hosting
- any web developer, as a small one-off job
- Vercel's own support, if you are on a paid plan

Hand them `GO-LIVE-COPY-PASTE.md`. It is written so that someone who has never
seen this project can follow it.

**One safety note if you do hand it over:** the `service_role` key from
Supabase gives complete control of your database — all your customers, orders
and payments. It is fine to let a trusted person paste it into Vercel. It is
not fine to email it, put it in a WhatsApp message, or leave it in a shared
document. If it ever does get sent somewhere it shouldn't, Supabase can
generate a fresh one and the old one stops working.
