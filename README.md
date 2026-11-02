# MARGEN Dashboard

Internal web app for MARGEN: organizations, contacts, athletes, leads and user access levels,
backed by the Supabase project **MARGEN DATA**.

## Run it locally

No build step or installs are needed, only Python to serve the files:

```bash
python -m http.server 5173 --bind 127.0.0.1
```

Then open http://localhost:5173 and sign in with a Supabase account.

## Files

| Path | What it is |
|---|---|
| `index.html` | Page shell |
| `app.js` | The whole app: sign-in, routing, pages, data access |
| `styles.css` | Styles, including dark mode |
| `config.js` | Supabase project URL and publishable key (safe in the browser) |
| `supabase/migrations/` | Every database change, in the order it was applied |

## Access levels

Each account has a role in `public.profiles`: **admin**, **factory** or **client**.
New accounts start as client. Only admins can see or change data; the database's
row level security enforces this, not just the app's menus. Admins change roles on the Users page.

## Database changes

Make every schema change as a new file in `supabase/migrations/` named
`<timestamp>_<description>.sql`, and apply it to the Supabase project in the same order.
