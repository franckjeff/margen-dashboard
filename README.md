# MARGEN Dashboard

Internal web app for MARGEN: organizations, contacts, athletes, leads, orders with their items
and sizes, and user access levels,
backed by the Supabase project **MARGEN DATA**.

## Run it locally

No build step or installs are needed, only Python to serve the files:

```bash
python serve.py 5173
```

`serve.py` is a plain static server that turns off browser caching, so a reload always shows the latest code.

Then open http://localhost:5173 and sign in with a Supabase account.

## Files

| Path | What it is |
|---|---|
| `index.html` | Page shell |
| `app.js` | The whole app: sign-in, routing, pages, data access |
| `styles.css` | Styles following the MARGEN branding guidelines (navy, storm blue, green; Exo 2 and Open Sans), including dark mode |
| `assets/` | MARGEN logo and favicon, taken from the brand's logo files || `config.js` | Supabase project URL and publishable key (safe in the browser) |
| `supabase/migrations/` | Every database change, in the order it was applied |

## Access levels

Each account has a role in `public.profiles`: **admin**, **factory** or **client**.
New accounts start as client. Only admins can see or change data; the database's
row level security enforces this, not just the app's menus. Admins change roles on the Users page.

## Database changes

Make every schema change as a new file in `supabase/migrations/` named
`<timestamp>_<description>.sql`, and apply it to the Supabase project in the same order.
