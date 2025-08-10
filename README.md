# Phoenix Pull — Mobile (Supabase)
Modern, mobile-first pull list with categories, search, and tap-friendly controls. Includes:
- Email/password auth (Supabase)
- Admin dashboard (roles, activate/deactivate users)
- Interaction logs (CSV export)
- Per-user quantities + restock flags saved in Supabase (works across devices)

## Quick start
1. **Create a Supabase project** → copy your **Project URL** and **anon key** (Project Settings → API).
2. In Supabase → SQL editor → **run `db.sql`** from this repo (creates tables + RLS policies + trigger).
3. Copy `config.example.js` to `config.js` and paste your URL + anon key.
4. Open `index.html` locally, or deploy to Netlify (no build step).

### Make yourself admin
- Sign up with your email in the app.
- In Supabase → Table Editor → `profiles` → set your `role` to `admin` for your user row.

### Notes
- Deleting `auth.users` requires server/admin key; the app lets admins **deactivate** users (recommended).
- The “Invite” form creates/updates a `profiles` row for an email so you can set role/active before they sign in.
- RLS ensures users only see/edit **their own** quantities and logs; admins can see everything.

## Deploy to Netlify
- Drag-and-drop the folder, or connect to Git and set publish dir to `/`.
- Add your `config.js` file to the repo or Netlify environment (you can also inject it as an inline file).

## Dev
- No build tools. Tailwind via CDN; Supabase JS via CDN.
- Edit `DATA` in `app.js` to change categories/items.
