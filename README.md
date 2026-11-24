# MARGEN Dashboard

Internal web app for MARGEN: organizations, contacts, athletes, leads, orders with their items
and sizes, the factories that make them, and user access levels,
backed by the Supabase project **MARGEN PROD**.

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
| `npm run db:types` | Regenerates `src/lib/database.types.ts` from the live database (sign in once first with `npx supabase login`) |

## Files

| Path | What it is |
|---|---|
| `index.html` | Page shell |
| `src/main.tsx`, `src/App.tsx` | Start-up and the page routes (hash URLs such as `#/customs/<id>`) |
| `src/auth/` | Sign-in, the signed-in user and their role |
| `src/data/` | Every Supabase read (`queries.ts`) and write (`mutations.ts`), with what each write refreshes |
| `src/features/<area>/` | One folder per page: dashboard, orders, order requests, order entry (public), items, factories, organizations, contacts, athletes, leads, reports, users, emails, notes, status colors, the user guide |
| `src/components/` | Shared pieces: layout and menu, list pages, notices, badges, icons |
| `src/lib/` | Supabase client and database types, constants, formatting, theme, spreadsheets |
| `src/styles.css` | Styles following the MARGEN branding guidelines (navy, storm blue, green; Exo 2 and Open Sans), including dark mode |
| `src/assets/`, `public/` | MARGEN logo and favicon, taken from the brand's logo files |
| `src/config.ts` | Supabase project URL and publishable key (safe in the browser) |
| `supabase/migrations/` | Every database change, in the order it was applied |
| `supabase/functions/` | Server-side functions that need the project's secret key (creating accounts, sending emails) |

## Adding a page

1. Add it to `PAGES` in `src/lib/constants.ts` with the roles that may see it.
2. Create `src/features/<area>/<Name>Page.tsx`.
3. Add a lazy import and a route in `src/App.tsx`.
4. Put its database reads in `src/data/queries.ts`. For each table it writes, list what to refresh in `INVALIDATES` in `src/data/mutations.ts`.

## Access levels

Each account has a role in `public.profiles`: **admin**, **factory** or **client**.
New accounts start as client. The database's row level security enforces what each role can do,
not just the app's menus.

- **Admin:** sees and changes everything.
- **Factory:** sees only the orders assigned to its factory, with their items, and can change only
  their production status and shipping details. It never sees the client organizations.
- **Client:** sees only its organization's orders, with their status, shipping details and items,
  and can't change anything. It never sees factories or the order history.

Admins change roles on the Users page, and link each factory account to its factory and each client account to its organization there.

Orders are listed by order status on pages under Custom Orders: **New** (Received and Accepted),
**In Production** and **Shipped**. **Cancelled & Archived** lists cancelled orders, and
archived ones: archiving is a flag on the order (`archived_at`), not a status, so an
archived order keeps its status. Only Shipped orders can be archived, and an archived order's statuses and factory
don't change until it is unarchived (`private.check_status_flow()`); unarchiving is always allowed. Assigning an order to a factory moves it to In production with production at Not started
(`private.production_on_assignment()`); the factory then sets production to Received, Accepted and the production steps. Setting production to Shipped also marks the order Shipped, and taking
production back off Shipped puts a Shipped order back to In production (a database trigger,
`private.ship_order_with_production()`, so it applies to factory users and imports too). Statuses follow the
flow one step at a time, for admins too (`private.check_status_flow()`): a new order starts Received at Not started with
no factory; by hand an order goes Received ↔ Accepted, or to Cancelled until it ships; a factory is assigned, moved or taken
off only while the order is Accepted or In production (not taken off once production is past Accepted); production moves one
step either way while the order is In production, and only back from Shipped once it has shipped. Changes from outside the
app (SQL editor, service key) aren't checked, so data can be repaired. `src/lib/statusFlow.ts` mirrors these rules so the
menus offer only allowed steps. `ORDER_LISTS` in `src/lib/constants.ts` says which statuses each page lists.

Admins add accounts with **Add user** on the Users page: email, access level, first name, and the factory
or organization to link. That calls the `create-user` function (`supabase/functions/create-user`), which
runs on Supabase's servers because creating accounts needs the secret key, and refuses anyone who isn't
an admin. The app sends no email when it adds an account: either set a temporary password and give it to
the person, or leave it empty and they choose one with "Forgot your password?" on the sign-in page.

The function checks who is calling itself, so it's deployed with "Verify JWT" turned off
(`npx supabase functions deploy create-user --no-verify-jwt`). Deploy it to MARGEN TEST first, then MARGEN PROD.

Clients send orders without signing in from the public **Order Entry** page, `#/order`: they pick
items and sizes, or upload the order template the page offers. Requests land on the admins' Order requests page,
where each one is turned into an order or rejected. The page can only read item names and send a request
through the `submit_order_request` database function, which limits how many requests arrive per hour.

Every role has a **Scrapbook** on its Dashboard: free text that saves itself as you type.
Each person sees only their own; not even admins can read anyone else's.

## App errors

When a page crashes, the user sees "Something went wrong on this page" with a Reload button, and
the menu keeps working. Crashes, failed database calls and other errors are logged to the
`app_errors` table (by `src/lib/errorLog.ts`), and admins see them at the bottom of the Dashboard.
Errors the user can fix themselves, like a duplicate Margen order ID, aren't logged. Repeats are
counted rather than stored again, floods are capped, and entries are removed after 90 days.

## Emails

The app emails people when something happens:

- **Order assigned to a factory:** that factory's default contact.
- **Order shipped** (production set to Shipped): the default contact of the order's organization.
- **New order request** from the Order Entry page: the admins (their user accounts).
- **New quote request** from the public Request a quote page: the admins.
- **Athlete note added:** the admins, except the one who added it.
- **Note on an order:** from the order's factory, the admins; from an admin, the factory's default contact. Order notes
  are internal: only admins and the order's factory see them, never the client.

Factories and organizations each link to contacts, one of them the default, and the default contact's email
address gets their emails, so people at a factory or club don't need an account. Admins link contacts on the
Factory, Organization and Contacts pages. Factory and client users manage their own on their Contacts page:
they add contacts (`add_my_contact()`), edit them, choose the default and remove them, and see no one else's.
Each contact has an optional phone number (marked when it's on WhatsApp, with a link to open a chat), a delivery
address and a billing address, which is the delivery address unless `billing_same_as_delivery` is turned off.
With no default contact, or one without an email address, the event is still logged, as "Nobody to email".

The browser never sends email. Database triggers write each email into the `email_outbox` table, one row
per person, with recipients always taken from the database (contacts, or admin `profiles`). Order emails wait a few minutes first
(`delay_minutes`), and undoing the change in that time cancels them. Every minute a `pg_cron` job checks for
emails that are due and calls the `send-emails` function (`supabase/functions/send-emails`). The function
writes each email from fixed templates, sends it through [Resend](https://resend.com) and records the result.
Failures are tried again, up to 5 times. Admins see every email on the **Email Admin and Logs** page, where they can
cancel one or send it again. The page also lets admins:

- **Pause all sending** (`paused`): emails keep queuing and go out on resume.
- **Turn each kind of email on or off** (`disabled_kinds`): one that's off is still logged, as cancelled, and
  turning a kind off cancels those still waiting.
- **Send themselves a sample** of any kind (`send_sample_email()`), with made-up details, to their own address.
- **Choose who gets admin emails** (`set_admin_email()`): each admin, for each kind of admin email, is on or off
  (`profiles.muted_email_kinds`). Turning one off cancels those still waiting for them.
- **Change the sender and the wait** before order emails (`set_email_sender()`, 0 to 60 minutes).
- **Preview** each email with made-up details. The page writes it with the same templates as the function
  (`supabase/functions/send-emails/templates.ts`), so the preview is what gets sent.
- See **warnings** at the top: failures in the last day, emails being retried, and why emails reached nobody.

Admins change these through database functions that check they're an admin; they can't edit
`email_settings` directly. The rest of the settings are changed in the SQL editor:

- `mode`: `off` (nothing is sent; emails wait), `redirect` (every email goes to `redirect_to`, with
  its real recipient in the subject; use this on MARGEN TEST) or `live`.
- `from_address` (also on the page): the sender, on a domain verified in Resend. Resend's test sender
  `MARGEN <onboarding@resend.dev>` works without a domain, but only delivers to the Resend account's own address.
- `app_url`: where the email buttons link to.

Setting up sending on a project:

1. Deploy the function with "Verify JWT" turned off (`npx supabase functions deploy send-emails --no-verify-jwt`).
   It checks a shared secret instead. Deploy `index.ts` and `templates.ts` together.
2. In the dashboard, under Edge Functions → Secrets, add `RESEND_API_KEY`. Until it's set, nothing is sent.
3. In the SQL editor, store the function's address and a new random secret in the vault:
   ```sql
   select vault.create_secret('https://<project ref>.supabase.co/functions/v1/send-emails', 'email_sender_url');
   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'email_sender_secret');
   ```
4. Set `email_settings` (`mode`, `from_address`, `app_url`).

## Database changes

Every schema change follows the same steps:

1. Write it as a new file in `supabase/migrations/` named `<timestamp>_<description>.sql`.
2. Apply it to the **MARGEN TEST** project first, run the access tests there, then apply it to
   **MARGEN PROD** (live). Both get the files in the same order.
3. Make sure the file's timestamp is the version Supabase recorded for it on the live project (Database → Migrations in the
   dashboard, or `npx supabase migration list`). Some tools record the time the migration ran rather
   than the file's name, so rename the file if they differ. The Supabase CLI matches migrations by this
   number, and a mismatch would make it try to run old migrations again.
4. Regenerate the types with `npm run db:types`, then run `npm run build`.
5. If the change affects who can see or change something, update `supabase/tests/access_rules.sql`
   and run it (see Access tests below).

`src/lib/database.types.ts` is generated: never edit it by hand. It's how TypeScript checks every
database call, so a hand edit with a mistake would hide real errors until someone opens the page.
After regenerating, the build points at any code that no longer matches the database.

Postgres doesn't record whether a function argument may be left empty, so the generated types list every
argument as required. Give an optional argument a `default null` so it becomes optional in the types.

## Test database

**MARGEN TEST** (project `qutuktsinfzkvvvatgwj`, free) is a copy of the live database's structure,
built from the files in `supabase/migrations/` and recorded under the same versions. It holds no client
data. Use it to try database changes and to run the access tests, so mistakes never reach client data.
Keep it in step: every migration goes to MARGEN TEST before MARGEN PROD.

On the Free plan, Supabase pauses a project after a week with no activity. If MARGEN TEST is paused,
restore it from the Supabase dashboard; nothing is lost.

## Access tests

`supabase/tests/access_rules.sql` checks the access rules above automatically: 329 checks of what
admins, factories, clients and visitors who aren't signed in can see and change, table by
table, plus the public and admin-only database functions and which emails are queued for whom. To run it, open the **MARGEN TEST** project,
paste the whole file into the SQL editor and click Run.

It always ends with an error, on purpose: that is how everything it did is undone, including the test
users and records it creates. The error message is the result: `ACCESS TESTS PASSED: 329 checks`, or
`ACCESS TESTS FAILED` followed by each check that failed. It's also safe to run on the live database,
which is worth doing once after each change goes live.
