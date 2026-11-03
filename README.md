# MARGEN Dashboard

Internal web app for MARGEN: organizations, contacts, athletes, leads, orders with their items
and sizes, the factories that make them, and user access levels,
backed by the Supabase project **MARGEN DATA**.

Built with React, TypeScript and Vite. TanStack Query caches the data, and React Router handles pages.

## Run it locally

You need [Node.js](https://nodejs.org) (LTS). Install the packages once:

```bash
npm install
```

Then start the development server:

```bash
npm run dev
```

Open http://localhost:5173 and sign in with a Supabase account. Saved code changes show up straight away.

## Other commands

| Command | What it does |
|---|---|
| `npm run build` | Type-checks, then builds the site into `dist/`. Any static host can serve that folder |
| `npm run preview` | Serves the built `dist/` folder to check it before deploying |
| `npm test` | Runs the unit tests (Vitest) |
| `npm run typecheck` | Checks the TypeScript types only |
| `npm run lint` | Runs ESLint |

## Files

| Path | What it is |
|---|---|
| `index.html` | Page shell |
| `src/main.tsx`, `src/App.tsx` | Start-up and the page routes (hash URLs such as `#/customs/<id>`) |
| `src/auth/` | Sign-in, the signed-in user and their role |
| `src/data/` | Every Supabase read (`queries.ts`) and write (`mutations.ts`), with what each write refreshes |
| `src/features/<area>/` | One folder per page: dashboard, orders, items, factories, organizations, contacts, designs, athletes, leads, reports, users, notes |
| `src/components/` | Shared pieces: layout and menu, list pages, notices, badges, icons |
| `src/lib/` | Supabase client and database types, constants, formatting, theme, spreadsheets |
| `src/styles.css` | Styles following the MARGEN branding guidelines (navy, storm blue, green; Exo 2 and Open Sans), including dark mode |
| `src/assets/`, `public/` | MARGEN logo and favicon, taken from the brand's logo files |
| `src/config.ts` | Supabase project URL and publishable key (safe in the browser) |
| `supabase/migrations/` | Every database change, in the order it was applied |

## Adding a page

1. Add it to `PAGES` in `src/lib/constants.ts` with the roles that may see it.
2. Create `src/features/<area>/<Name>Page.tsx`.
3. Add a lazy import and a route in `src/App.tsx`.
4. Put its database reads in `src/data/queries.ts`. For each table it writes, list what to refresh in `INVALIDATES` in `src/data/mutations.ts`.

## Access levels

Each account has a role in `public.profiles`: **admin**, **factory**, **client** or **designer**.
New accounts start as client. The database's row level security enforces what each role can do,
not just the app's menus.

- **Admin:** sees and changes everything.
- **Factory:** sees only the orders assigned to its factory, with their items, and can change only
  their production status and shipping details. It never sees the client organizations.
- **Client:** sees the Dashboard only for now.
- **Designer:** sees only the Dashboard and the Designs page (not built yet), and no database tables.

Admins change roles on the Users page, and link each factory account to its factory there.

Every role has a **Scrapbook** on its Dashboard: free text that saves itself as you type.
Each person sees only their own; not even admins can read anyone else's.

## Database changes

Make every schema change as a new file in `supabase/migrations/` named
`<timestamp>_<description>.sql`, and apply it to the Supabase project in the same order.
After a change, regenerate `src/lib/database.types.ts` from the project's schema.
