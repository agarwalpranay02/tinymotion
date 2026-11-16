# Put TinyMotion online for free

TinyMotion needs only two free services: **Vercel** for the website and API (the model runs inside the API function, so there is no separate inference server to host or keep awake) and **Neon** for the small Postgres database that holds accounts and API keys.

| Piece | Service | Used for |
|---|---|---|
| Website and API | Vercel (Hobby) | Pages, the developer API, sign-in |
| Database | Neon (Free) | Accounts, sessions, API keys and usage |
| Email (optional) | Resend (Free) | Contact-form notifications |

## 1. Import the repository into Vercel

New Project → import this GitHub repository → **Root Directory: `apps/web`** → framework Next.js. Don't deploy yet.

## 2. Add a database

In the project: Storage → Create → Neon (Free plan) → connect it to the project. Vercel adds `DATABASE_URL` (pooled) and related variables. Tables are created automatically on first start (`AUTO_MIGRATE=1`).

## 3. Environment variables

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://<your-project>.vercel.app` |
| `BETTER_AUTH_URL` | same as above |
| `BETTER_AUTH_SECRET` | `openssl rand -hex 32` |
| `API_KEY_PEPPER` | `openssl rand -hex 24` (never change it after launch: it invalidates every key) |
| `AUTO_MIGRATE` | `1` |
| `NEXT_PUBLIC_CONTACT_EMAIL` | the address shown on the site |
| `CONTACT_INBOX` | where contact-form messages go (optional, needs Resend) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from step 4 |
| `RESEND_API_KEY` | optional, a sending-only key from resend.com |

## 4. Google sign-in

Google Cloud Console → APIs and Services → Credentials → OAuth client ID (Web application). Authorised redirect URI: `https://<your-project>.vercel.app/api/auth/callback/google`. Copy the client ID and secret into Vercel.

## 5. Deploy and check

Deploy, then open `/api/v1/health`: it runs the model on a zero window and should answer `{"status":"ok"}`. Sign in on `/account`, create a key, and try it in the playground on `/developers`.

A custom domain is optional and paid; if you add one, update `NEXT_PUBLIC_SITE_URL`, `BETTER_AUTH_URL` and the Google redirect URI.
