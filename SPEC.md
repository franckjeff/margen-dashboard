# MARGEN Dashboard: Application Spec

This describes the application as it currently works. It covers what each part does, who can see it, and how the data is stored. The README covers how to run the app.

## 1. Purpose

An internal web app for MARGEN. It tracks organizations (clients) and their contacts, athletes, sales leads, orders with their items and sizes, and the users who have access. The data lives in the Supabase project **MARGEN DATA**.

## 2. Architecture

- **Front end:** a static single-page app. It has no build step: `index.html`, `styles.css`, `config.js`, and `app.js` (one ES module). Hash routing, for example `#/organizations/<id>/edit`.
- **Back end:** Supabase (Postgres, Auth, and row level security). The browser talks to it directly with supabase-js v2 and the publishable key in `config.js`.
- **Spreadsheets:** SheetJS (xlsx) is loaded on demand from its CDN to import and export Excel or CSV files.
- **Local serving:** `python serve.py 5173`. It serves files with caching turned off.
- **Schema changes:** every change is a migration in `supabase/migrations/`, named `<timestamp>_<description>.sql`.

## 3. Access and roles

Each user has a row in `profiles` with a `role` and a `first_name`.

| Role | What they can see |
|---|---|
| **admin** | Everything: all pages and all data, and can change roles. |
| **factory** | Dashboard only. Reserved for factory access, which is not built yet. |
| **client** | Dashboard only. Order and client views for clients are not built yet. |

New accounts start as **client**. Row level security enforces these rules in the database. The menu is only a convenience.

Admins are the only users who can read the last sign-in data (see Users below).

## 4. Navigation

The side menu groups pages under headings:

- **Dashboard**: all roles.
- **Orders**: Customs (the orders list), Shopify (placeholder), Items.
- **Clients**: Leads, Organizations, Contacts.
- **Athletes**, **Reports**, **Users**: admins only.

Customs is the URL for the orders table, `#/customs`.

## 5. Pages

### 5.1 Dashboard
- Greets the user by first name, with a time-of-day greeting. Admins without a first name see a hint to set one on the Users page.
- Shows a **Quote of the day**. It is one of 24 business and success quotes, and it stays the same all day.
- **Admin only:** summary stats and notes. A note can be attached to a contact or an athlete. Notes can be dismissed by the user who dismissed them, and dismissals are stored per user.
- Other roles see the welcome section and a short message.

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

### 5.6 Customs (orders)
- **Order fields:** order IDs (MARGEN and factory IDs), organization, **order status** (Received, Accepted, On hold, Cancelled, Closed), and **production status** (Job sheet approved, Artwork in progress, In printing queue, Sewing, Trimming, Shipped), plus the date added.
- **Items on an order:** the items table is read-only until the user clicks **Edit**.
  - Each line is an item with a size and a quantity.
  - Adding a line that matches an existing item and size merges into that line.
  - Quantities must be at least 1.
  - In Edit mode, changes to items are saved as they are made.
- **Order history:** a list of every change to the order, showing who made it and when. Actions are created, updated, deleted, item added, item changed, and item removed. Empty fields are not logged as changes.
- **Import from Excel:** a page at `#/customs/import`. It reads `.xlsx`, `.xls`, or `.csv` files. A template can be downloaded. Rows are checked before they are imported.

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

### 5.8 Shopify
- Placeholder page. No functionality yet.

### 5.9 Reports
Each report can be filtered and downloaded as an Excel file.

- **Order report:** every order with its IDs, organization, statuses, pieces, and date added. Filters: organization, order status, production status, and date added range.
- **Order detail report:** every order with all its details. It has one row per item and size. Search by order ID (the MARGEN or factory ID), or leave it empty to get all orders.

### 5.10 Users
- Lists every account with its email, **first name** (editable inline), **access level** (admin, factory, client; changeable by admins), **last signed in** (or "Never"), and the date it was added.
- Last sign-in comes from the authentication records through the `user_last_sign_ins()` function. It returns data only to admins.

## 6. Data model

| Table | Purpose |
|---|---|
| `profiles` | One row per user: email, role, first name. |
| `organizations` | Clients. |
| `contacts` | People. Linked to organizations through `organization_contacts`. |
| `athletes` | Athletes. |
| `leads` | Sales leads and their status. |
| `orders` | Orders and their statuses. |
| `items` | Garment types (ID and name). |
| `order_items` | Lines on an order: order, item, size, quantity. |
| `order_events` | Audit history of order changes. Written only by database triggers, so the app cannot write to it. It has no foreign key to `orders`, so the history survives a deleted order. |
| `notes` | Notes on contacts or athletes. |
| `note_dismissals` | Which user dismissed which note. |

Security-definer functions live in the `private` schema, and `private.is_admin()` is used by the policies.

## 7. Security

- The publishable key is in the browser. What it can reach is limited by row level security on every table.
- Only admins can change roles, read sign-in data, or write audit data.
- Passwords and the service-role key are never in the code. `.env` files are git-ignored.
- Sign-in is by Supabase email and password.

## 8. Known limitations and open items

- **Not built yet:** factory and client views of orders, the Shopify page, restricting sizes per item, lead conversion, and an Excel import for size-grid order sheets beyond the current one.
- **First names** must be set by each user on the Users page. They are not pre-filled.
- **Supabase advisors:** the security advisor flags leaked password protection as not enabled. This is an account-level setting and is the admin's decision.
- **Single file:** `app.js` is about 2,400 lines and holds every page and report.
- **Quotes** are fixed in the code, so changing them means editing `app.js`.
