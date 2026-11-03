# MARGEN Dashboard: Application Spec

This describes the application as it currently works. It covers what each part does, who can see it, and how the data is stored. The README covers how to run the app.

## 1. Purpose

An internal web app for MARGEN. It tracks organizations (clients) and their contacts, athletes, sales leads, orders with their items and sizes, the factories that make them, and the users who have access. The data lives in the Supabase project **MARGEN DATA**.

## 2. Architecture

- **Front end:** a single-page app in React and TypeScript, built with Vite into static files. Hash routing with React Router, for example `#/organizations/<id>/edit`. Code is split by feature under `src/features/`, and each page's code loads the first time it's opened.
- **Data:** TanStack Query caches one query per table. Each write refreshes only the tables listed for it in `src/data/mutations.ts`. Signing in or out clears the cache.
- **Back end:** Supabase (Postgres, Auth, and row level security). The browser talks to it directly with supabase-js v2 and the publishable key in `src/config.ts`. Database types are generated into `src/lib/database.types.ts`.
- **Spreadsheets:** SheetJS (xlsx) is bundled and loaded only when a spreadsheet is imported or exported.
- **Local serving:** `npm run dev` (port 5173). `npm run build` writes the static site to `dist/`.
- **Tests:** Vitest unit tests for import checks, report filters, order history and list search (`npm test`).
- **Schema changes:** every change is a migration in `supabase/migrations/`, named `<timestamp>_<description>.sql`.

## 3. Access and roles

Each user has a row in `profiles` with a `role`, a `first_name`, and, for factory accounts, a `factory_id`.

| Role | What they can see |
|---|---|
| **admin** | Everything: all pages and all data, and can change roles. |
| **factory** | Dashboard and Orders, showing only the orders assigned to the factory the account is linked to. They can change only the production status and the shipping details (see 5.6). |
| **client** | Dashboard only. Order and client views for clients are not built yet. |

New accounts start as **client**. Row level security enforces these rules in the database. The menu is only a convenience.

Admins are the only users who can read the last sign-in data (see Users below).

## 4. Navigation

The side menu groups pages under headings:

- **Dashboard**: all roles.
- **Customs**: Orders (the orders list), Items, Factories. Factory users see only Orders.
- **Clients**: Leads, Organizations, Contacts.
- **Athletes**, **Reports**, **Users**: admins only.

The Orders page's URL is `#/customs`, kept from when the page itself was named Customs.

## 5. Pages

### 5.1 Dashboard
- Greets the user by first name, with a time-of-day greeting. Admins without a first name see a hint to set one on the Users page.
- Shows a **Quote of the day**. It is one of 24 business and success quotes, and it stays the same all day.
- **Admin only:** summary stats and notes. A note can be attached to a contact, an athlete or a factory. Notes can be dismissed by the user who dismissed them, and dismissals are stored per user.
- **Factory users** see their factory's name and counts of its open orders, orders in production, and all orders. An account not yet linked to a factory is told to ask an admin.
- Client users see the welcome section and a short message.

### 5.2 Organizations
- List with search and filters. Create, view, and edit.
- An organization has a name, address (`address_line1`, `address_line2`, `city`, `state`, `postal_code`, `country`), and contacts.
- Each organization has a default contact. An organization can have several contacts, and a contact can belong to more than one organization.

### 5.3 Contacts
- List, create, view, and edit. A contact has an address and can be linked to organizations.
- Contacts that are not linked to any organization are counted on the Dashboard.

### 5.4 Athletes
- List, create, view, and edit. Athletes can have notes attached.

### 5.5 Leads
- Sales leads with a status: **New**, **Contacted**, **Qualified**, **Converted**, or **Lost**. The open statuses are New, Contacted, and Qualified.
- List, create, view, and edit.

### 5.6 Orders
- **Order fields:** order IDs (MARGEN and factory IDs), organization, **factory** (or Not assigned), **order status** (Received, Accepted, On hold, Cancelled, Closed), and **production status** (Job sheet approved, Artwork in progress, In printing queue, Sewing, Trimming, Shipped), **shipping details** (estimated shipping date, actual shipping date, shipping method, and tracker: a tracking number or link, which opens in a new tab), plus the date added. The Orders list shows the estimated shipping date.
- **Items on an order:** the items table is read-only until the user clicks **Edit**.
  - Each line is an item with a size and a quantity.
  - Adding a line that matches an existing item and size merges into that line.
  - Quantities must be at least 1.
  - In Edit mode, changes to items are saved as they are made.
- **Order history:** a list of every change to the order, showing who made it and when. Actions are created, updated, deleted, item added, item changed, and item removed. Empty fields are not logged as changes.
- **Import from Excel:** a page at `#/customs/import`. It reads `.xlsx`, `.xls`, or `.csv` files. A template can be downloaded. Rows are checked before they are imported.

**Factory view:** factory users see the same Orders list and order pages. The database returns only the orders assigned to their factory, with those orders' items. In the Orders list they can change each order's **Production** status and **Est. shipping** date right in the row; each change saves at once. On an order's page they can change the **Production** status (menu in the header) and all the **Shipping** details (form with a Save button). They can't change anything else, and the database refuses it if tried. They don't see the organization (client), the order history, or the Edit, Delete, Import, order status, and factory controls. Opening another factory's order shows "This order doesn't exist". Their changes appear in the order history admins see.

### 5.7 Items
- Items are the garments: an **Item ID** (for example MEN-TANK or WMN-RACERBACK) and a **Name**.
- The list shows the number of orders and the total pieces ordered for each item.
- An item that is used on any order cannot be deleted.
- The item page lists the orders that include the item.

**Garment types and sizes** (from the sample size-grid sheet):
- Men: Tank, Sleeveless, Short Sleeve, Long Sleeve, Hoodie.
- Women: Racerback, Short Sleeve, Long Sleeve, Hoodie.
- Junior: Short Sleeve, Long Sleeve.
- Adult sizes: XS, S, M, L, XL, 2XL, 3XL. Junior sizes: 2, 4, 6, 8, 10, 12, 14, 16.
- The database only accepts these sizes.

### 5.8 Factories
- Factories make the orders: a **Name** (unique), a required **Contact name** (the main contact at the factory, typed in; the Contacts table is for clients), and an optional **Country** and **Description**. A factory can't be saved without a contact name.
- Each order is assigned to **zero or one factory**. A new order starts as **Not assigned**, including orders added by Excel import.
- Admins assign or change an order's factory from the **Factory** menu in the order page's header, or in the order's Edit form. The change is shown in the order history by factory name.
- The list shows each factory's open orders (Received, Accepted, On hold) and all its orders. The factory page lists its orders.
- A factory with orders assigned to it cannot be deleted. Deleting a factory also deletes its notes.
- **Notes:** the factory page has the same notes timeline as contacts (Enter saves, Shift+Enter adds a line, delete with confirmation). Factory notes also appear on the Dashboard.
- The list shows each factory's contact name, and search also matches the contact name and description.

### 5.9 Reports
Each report can be filtered and downloaded as an Excel file.

- **Order report:** every order with its IDs, organization, factory, statuses, shipping details, pieces, and date added. The order detail report also has the shipping details. Filters: organization, factory (including Not assigned), order status, production status, and date added range.
- **Order detail report:** every order with all its details. It has one row per item and size. Search by order ID (the MARGEN or factory ID), or leave it empty to get all orders.

### 5.10 Users
- Lists every account with its email, **first name** (editable inline), **access level** (admin, factory, client; changeable by admins), **factory** (for factory accounts: which factory's orders they see, or Not linked), **last signed in** (or "Never"), and the date it was added.
- Last sign-in comes from the authentication records through the `user_last_sign_ins()` function. It returns data only to admins.

## 6. Data model

| Table | Purpose |
|---|---|
| `profiles` | One row per user: email, role, first name, and the factory a factory account is linked to. |
| `organizations` | Clients. |
| `contacts` | People. Linked to organizations through `organization_contacts`. |
| `athletes` | Athletes. |
| `leads` | Sales leads and their status. |
| `orders` | Orders and their statuses. `factory_id` links an order to at most one factory, or none. Shipping: `estimated_ship_date`, `actual_ship_date`, `shipping_method`, `tracking_number`. |
| `factories` | Factories that make the orders (name, country, description), with a required `contact_name`. |
| `items` | Garment types (ID and name). |
| `order_items` | Lines on an order: order, item, size, quantity. |
| `order_events` | Audit history of order changes. Written only by database triggers, so the app cannot write to it. It has no foreign key to `orders`, so the history survives a deleted order. |
| `notes` | Notes on contacts, athletes or factories (each note has exactly one). |
| `note_dismissals` | Which user dismissed which note. |

Security-definer functions live in the `private` schema, and `private.is_admin()` is used by the policies.

## 7. Security

- The publishable key is in the browser. What it can reach is limited by row level security on every table.
- Only admins can change roles, read sign-in data, or write audit data.
- Factory users can read only their own factory, its orders, and those orders' lines and items (`private.my_factory()`). They can update only `production_status` and the four shipping columns of their factory's orders; a trigger (`private.limit_factory_order_changes()`) refuses any other change.
- Passwords and the service-role key are never in the code. `.env` files are git-ignored.
- Sign-in is by Supabase email and password.

## 8. Known limitations and open items

- **Not built yet:** client views of orders, Shopify orders (the placeholder page was removed), restricting sizes per item, lead conversion, and an Excel import for size-grid order sheets beyond the current one.
- **First names** must be set by each user on the Users page. They are not pre-filled.
- **Supabase advisors:** the security advisor flags leaked password protection as not enabled. This is an account-level setting and is the admin's decision.
- **Quotes** are fixed in the code, so changing them means editing `src/features/dashboard/welcome.ts`.
- **End-to-end tests** against a test Supabase project are not set up yet; only unit tests run.
