# Echoo Waitlist

Waitlist landing page built with Vite + React.

## Local development

1. Copy env vars:

   ```bash
   cp .env.example .env.local
   ```

2. Fill in at least:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

3. Run:

   ```bash
   npm install
   npm run dev
   ```

## Build

```bash
npm run build
```

## Deploy

### Vercel

- Root directory: `waitlist`
- Build command: `npm run build`
- Output directory: `dist`
- Set env vars from `.env.example`

`vercel.json` is included.

### Netlify

- Base directory: `waitlist`
- Build command: `npm run build`
- Publish directory: `dist`
- Set env vars from `.env.example`

`netlify.toml` is included.

## Required DB migrations

Before production deploy, run the Supabase migrations in `Echoo/supabase/migrations`, including feature request + voting permission fixes.

## Waitlist email confirmation

This project uses double opt-in:

- signup creates/returns waitlist position via `public.join_waitlist(...)`
- user confirms via link (`/#/confirm?token=...`)
- status switches from `pending_confirmation` to `waitlist`

### Deploy Supabase function

Deploy function:

```bash
supabase functions deploy waitlist-send-confirmation
```

Set secrets for the function:

```bash
supabase secrets set RESEND_API_KEY=...
supabase secrets set WAITLIST_BASE_URL=https://your-waitlist-domain.com
supabase secrets set WAITLIST_FROM_EMAIL="Echoo <hello@yourdomain.com>"
```
