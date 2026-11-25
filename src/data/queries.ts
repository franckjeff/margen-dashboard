import { useQuery } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { CONTACT_DETAIL_COLUMNS, ORDER_LISTS, type OrderList, type PageName, type Role } from "../lib/constants";
import type { Tables } from "../lib/database.types";
import { byName, byPerson } from "../lib/format";
import { DbError, supabase, unwrap } from "../lib/supabase";

// Each table is fetched by its own query and cached under its own key, so a page only loads
// what it shows and a change only refetches what it touched (see INVALIDATES in mutations.ts).
// Only admins can read these tables, except that factory users can read their own factory, its
// orders, and those orders' lines and items (see the factory_users_see_their_orders migration).

export const keys = {
  profile: (userId: string) => ["profile", userId] as const,
  organizations: ["organizations"] as const,
  contacts: ["contacts"] as const,
  athletes: ["athletes"] as const,
  leads: ["leads"] as const,
  orders: ["orders"] as const,
  orderEvents: ["orderEvents"] as const,
  items: ["items"] as const,
  factories: ["factories"] as const,
  orderItems: ["orderItems"] as const,
  notes: ["notes"] as const,
  dismissals: ["dismissals"] as const,
  scrapbook: ["scrapbook"] as const,
  orderRequests: ["orderRequests"] as const,
  appErrors: ["appErrors"] as const,
  emails: ["emails"] as const,
  emailSettings: ["emailSettings"] as const,
  myContacts: ["myContacts"] as const,
  users: ["users"] as const,
  statusColors: ["statusColors"] as const,
  dashboardCounts: ["dashboardCounts"] as const,
};

// disabled: an admin disabled the account; it keeps its profile but has no access.
// mustChangePassword: they still have the temporary password from their welcome email.
export type Profile = { role: Role | null; firstName: string | null; disabled: boolean; mustChangePassword: boolean };
export type LinkedContact = Pick<Tables<"contacts">, "id" | "first_name" | "last_name" | "email" | "phone" | "whatsapp" | "city" | "country"> & { is_default: boolean };
export type LinkedOrganization = Pick<Tables<"organizations">, "id" | "name" | "state" | "country"> & { is_default: boolean };
export type LinkedFactory = Pick<Tables<"factories">, "id" | "name" | "country"> & { is_default: boolean };
export type Organization = Tables<"organizations"> & { contacts: LinkedContact[] };
export type Contact = Tables<"contacts"> & { organizations: LinkedOrganization[]; factories: LinkedFactory[] };
export type Athlete = Tables<"athletes">;
export type Lead = Tables<"leads">;
export type Order = Omit<Tables<"orders">, "created_at"> & {
  created_at: string;
  organization: { id: string; name: string } | null;
  factory: { id: string; name: string } | null;
};
export type Item = Tables<"items">;
export type Factory = Tables<"factories"> & { contacts: LinkedContact[] };
// A factory or client user's own contacts (see the emails_to_default_contacts migration).
export type MyContact = Omit<Tables<"contacts">, "created_at"> & { owner_id: string; is_default: boolean };
export type OrderLine = Pick<Tables<"order_items">, "id" | "order_id" | "item_id" | "size" | "quantity">;
export type OrderEvent = Pick<Tables<"order_events">, "id" | "order_id" | "action" | "changed_at" | "changed_by_name"> & {
  changes: Record<string, { from?: unknown; to?: unknown }>;
  author: { email: string | null } | null;
};
export type Note = Pick<
  Tables<"notes">,
  "id" | "contact_id" | "athlete_id" | "factory_id" | "organization_id" | "order_id" | "body" | "created_at" | "created_by" | "author_name" | "from_factory"
> & {
  author: { email: string | null } | null;
  // The name of what the note is about, so the Dashboard needn't load every contact, athlete, organization and factory.
  contact: { first_name: string; last_name: string } | null;
  athlete: { first_name: string; last_name: string } | null;
  organization: { name: string } | null;
  factory: { name: string } | null;
  order: { margen_order_id: string } | null;
};
export type User = Pick<Tables<"profiles">, "id" | "email" | "first_name" | "last_name" | "muted_email_kinds" | "factory_id" | "organization_id" | "created_at" | "disabled_at"> & {
  role: Role;
  last_sign_in_at: string | null;
};

// The signed-in user's access level and first name. A missing profile row means no access.
export function useProfile(userId: string) {
  return useQuery({
    queryKey: keys.profile(userId),
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.from("profiles").select("role, first_name, disabled_at, must_change_password").eq("id", userId).maybeSingle();
      if (error) throw new DbError(error);
      return { role: (data?.role as Role | undefined) ?? null, firstName: data?.first_name ?? null, disabled: Boolean(data?.disabled_at), mustChangePassword: data?.must_change_password ?? false };
    },
  });
}

const LINKED_CONTACT = "id, first_name, last_name, email, phone, whatsapp, city, country";

// Flattens link rows so each linked contact carries the link's is_default flag.
const flattenContacts = (links: { is_default: boolean; contacts: Omit<LinkedContact, "is_default"> | null }[]): LinkedContact[] =>
  links
    .filter((l) => l.contacts)
    .map((l) => ({ ...l.contacts!, is_default: l.is_default }))
    .sort(byPerson);

export function useOrganizations() {
  return useQuery({
    queryKey: keys.organizations,
    queryFn: async (): Promise<Organization[]> => {
      const rows = unwrap(
        await supabase
          .from("organizations")
          .select(`id, name, state, country, created_at, organization_contacts(is_default, contacts(${LINKED_CONTACT}))`)
          .order("name"),
      );
      return rows.map(({ organization_contacts: links, ...o }) => ({ ...o, contacts: flattenContacts(links) }));
    },
  });
}

export function useContacts() {
  return useQuery({
    queryKey: keys.contacts,
    queryFn: async (): Promise<Contact[]> => {
      const rows = unwrap(
        await supabase
          .from("contacts")
          .select(
            `id, first_name, last_name, email, created_at, ${CONTACT_DETAIL_COLUMNS}, organization_contacts(is_default, organizations(id, name, state, country)), factory_contacts(is_default, factories(id, name, country))`,
          )
          .order("last_name")
          .order("first_name"),
      ) as unknown as (Tables<"contacts"> & {
        organization_contacts: { is_default: boolean; organizations: Omit<LinkedOrganization, "is_default"> | null }[];
        factory_contacts: { is_default: boolean; factories: Omit<LinkedFactory, "is_default"> | null }[];
      })[];
      return rows.map(({ organization_contacts: orgLinks, factory_contacts: factoryLinks, ...c }) => ({
        ...c,
        organizations: orgLinks
          .filter((l) => l.organizations)
          .map((l) => ({ ...l.organizations!, is_default: l.is_default }))
          .sort(byName),
        factories: factoryLinks
          .filter((l) => l.factories)
          .map((l) => ({ ...l.factories!, is_default: l.is_default }))
          .sort(byName),
      }));
    },
  });
}

export function useAthletes() {
  return useQuery({
    queryKey: keys.athletes,
    queryFn: async (): Promise<Athlete[]> =>
      unwrap(
        await supabase
          .from("athletes")
          .select("id, first_name, last_name, state, country, created_at")
          .order("last_name")
          .order("first_name"),
      ),
  });
}

// Newest leads first.
export function useLeads() {
  return useQuery({
    queryKey: keys.leads,
    queryFn: async (): Promise<Lead[]> =>
      unwrap(await supabase.from("leads").select("*").order("created_at", { ascending: false })),
  });
}

// Newest orders first, with the linked organization's and factory's names.
export function useOrders() {
  return useQuery({
    queryKey: keys.orders,
    queryFn: async (): Promise<Order[]> =>
      unwrap(
        await supabase
          .from("orders")
          .select(
            "id, margen_order_id, factory_order_id, order_status, production_status, organization_id, organization_name, factory_id, estimated_ship_date, actual_ship_date, shipping_method, tracking_number, archived_at, created_at, organization:organizations(id, name), factory:factories(id, name)",
          )
          .order("created_at", { ascending: false }),
      ),
  });
}

// The orders an order page lists (archived ones aside), counted.
const orderListCount = (list: OrderList) => ({
  key: keys.orders,
  count: () => supabase.from("orders").select("id", { count: "exact", head: true }).is("archived_at", null).in("order_status", ORDER_LISTS[list]),
});

// The menu items that show how many records their page lists, and how each is counted.
// Each count sits under its page's query key, so whatever refreshes the page refreshes the count.
// The database's access rules apply as usual: everyone counts only what they can see.
const MENU_COUNTS: Partial<Record<PageName, { key: readonly string[]; count: (role: Role) => PromiseLike<{ count: number | null; error: PostgrestError | null }> }>> = {
  customs: orderListCount("customs"),
  "production-orders": orderListCount("production-orders"),
  "shipped-orders": orderListCount("shipped-orders"),
  "archived-orders": {
    key: keys.orders,
    // Cancelled orders and archived ones.
    count: () => supabase.from("orders").select("id", { count: "exact", head: true }).or("archived_at.not.is.null,order_status.eq.cancelled"),
  },
  leads: { key: keys.leads, count: () => supabase.from("leads").select("id", { count: "exact", head: true }) },
  contacts: { key: keys.contacts, count: () => supabase.from("contacts").select("id", { count: "exact", head: true }) },
  // Factory and client users' Contacts page lists their own factory's or organization's contacts.
  "my-contacts": {
    key: keys.myContacts,
    count: (role) =>
      role === "factory"
        ? supabase.from("factory_contacts").select("contact_id", { count: "exact", head: true })
        : supabase.from("organization_contacts").select("contact_id", { count: "exact", head: true }),
  },
  athletes: { key: keys.athletes, count: () => supabase.from("athletes").select("id", { count: "exact", head: true }) },
  factories: { key: keys.factories, count: () => supabase.from("factories").select("id", { count: "exact", head: true }) },
  organizations: { key: keys.organizations, count: () => supabase.from("organizations").select("id", { count: "exact", head: true }) },
  users: { key: keys.users, count: () => supabase.from("profiles").select("id", { count: "exact", head: true }) },
};

export const hasMenuCount = (page: PageName) => page in MENU_COUNTS;

// How many records a menu item's page lists. Only the number comes back, not the records.
export function useMenuCount(page: PageName, role: Role) {
  const spec = MENU_COUNTS[page];
  return useQuery({
    queryKey: [...(spec?.key ?? []), "menuCount", page],
    enabled: !!spec,
    queryFn: async (): Promise<number> => {
      const { count, error } = await spec!.count(role);
      if (error) throw new DbError(error);
      return count ?? 0;
    },
  });
}

// Written by a database trigger on every order change; newest first, with who made it.
export function useOrderEvents() {
  return useQuery({
    queryKey: keys.orderEvents,
    queryFn: async (): Promise<OrderEvent[]> =>
      unwrap(
        await supabase
          .from("order_events")
          .select("id, order_id, action, changes, changed_at, changed_by_name, author:profiles(email)")
          .order("changed_at", { ascending: false }),
      ) as unknown as OrderEvent[],
  });
}

export function useItems() {
  return useQuery({
    queryKey: keys.items,
    queryFn: async (): Promise<Item[]> =>
      unwrap(await supabase.from("items").select("id, item_code, name, created_at").order("name")),
  });
}

export function useFactories() {
  return useQuery({
    queryKey: keys.factories,
    queryFn: async (): Promise<Factory[]> => {
      const rows = unwrap(
        await supabase
          .from("factories")
          .select(`id, name, country, description, created_at, factory_contacts(is_default, contacts(${LINKED_CONTACT}))`)
          .order("name"),
      );
      return rows.map(({ factory_contacts: links, ...f }) => ({ ...f, contacts: flattenContacts(links) }));
    },
  });
}

// The contacts of the signed-in factory user's factory, or client user's organization.
// The database only returns their own links.
export function useMyContacts(role: Role) {
  return useQuery({
    queryKey: keys.myContacts,
    queryFn: async (): Promise<MyContact[]> => {
      const contact = `contacts(id, first_name, last_name, email, ${CONTACT_DETAIL_COLUMNS})`;
      const links = (
        role === "factory"
          ? unwrap(await supabase.from("factory_contacts").select(`owner_id:factory_id, is_default, ${contact}`))
          : unwrap(await supabase.from("organization_contacts").select(`owner_id:organization_id, is_default, ${contact}`))
      ) as unknown as { owner_id: string; is_default: boolean; contacts: Omit<MyContact, "is_default" | "owner_id"> | null }[];
      return links
        .filter((l) => l.contacts)
        .map((l) => ({ ...l.contacts!, owner_id: l.owner_id, is_default: l.is_default }))
        .sort(byPerson);
    },
  });
}

export function useOrderItems() {
  return useQuery({
    queryKey: keys.orderItems,
    queryFn: async (): Promise<OrderLine[]> =>
      unwrap(await supabase.from("order_items").select("id, order_id, item_id, size, quantity")),
  });
}

// Newest notes first, with who wrote them. The foreign key is named because notes also
// reach profiles through note_dismissals, which makes a bare "profiles" ambiguous.
export function useNotes() {
  return useQuery({
    queryKey: keys.notes,
    queryFn: async (): Promise<Note[]> =>
      unwrap(
        await supabase
          .from("notes")
          .select(
            "id, contact_id, athlete_id, factory_id, organization_id, order_id, body, created_at, created_by, author_name, from_factory, author:profiles!notes_created_by_fkey(email), contact:contacts(first_name, last_name), athlete:athletes(first_name, last_name), organization:organizations(name), factory:factories(name), order:orders(margen_order_id)",
          )
          .order("created_at", { ascending: false }),
      ),
  });
}

// Ids of notes this user has hidden from the Dashboard. Only their own dismissals are visible to them.
export type OrderRequestLine = Pick<Tables<"order_request_lines">, "id" | "item_id" | "size" | "quantity"> & { item: { name: string } | null };
export type OrderRequest = Tables<"order_requests"> & { lines: OrderRequestLine[] };

// Order requests sent by clients from the Order Entry page, newest first, with their lines. Admins only.
export function useOrderRequests() {
  return useQuery({
    queryKey: keys.orderRequests,
    queryFn: async (): Promise<OrderRequest[]> =>
      unwrap(
        await supabase
          .from("order_requests")
          .select("*, lines:order_request_lines(id, item_id, size, quantity, item:items(name))")
          .order("created_at", { ascending: false }),
      ),
  });
}

const APP_ERROR_COLUMNS = "id, kind, message, detail, page, user_agent, user_email, user_role, count, created_at, last_seen_at";
export type AppError = Omit<Tables<"app_errors">, "user_id">;

// Errors users hit in the last 90 days, most recent first. Only admins can read them.
export function useAppErrors() {
  return useQuery({
    queryKey: keys.appErrors,
    queryFn: async (): Promise<AppError[]> =>
      unwrap(await supabase.from("app_errors").select(APP_ERROR_COLUMNS).order("last_seen_at", { ascending: false }).limit(200)),
  });
}

export type Email = Tables<"email_outbox"> & {
  order: { id: string; margen_order_id: string } | null;
  request: { id: string; organization_name: string } | null;
  lead: { id: string; first_name: string; last_name: string; organization_name: string | null } | null;
  note: {
    id: string;
    athlete: { id: string; first_name: string; last_name: string } | null;
    order: { id: string; margen_order_id: string } | null;
  } | null;
};

// Admins only: the latest emails in the outbox, with what each one is about.
export function useEmails() {
  return useQuery({
    queryKey: keys.emails,
    queryFn: async (): Promise<Email[]> =>
      unwrap(
        await supabase
          .from("email_outbox")
          .select("*, order:orders(id, margen_order_id), request:order_requests(id, organization_name), lead:leads(id, first_name, last_name, organization_name), note:notes(id, athlete:athletes(id, first_name, last_name), order:orders(id, margen_order_id))")
          .order("created_at", { ascending: false })
          .limit(500),
      ),
  });
}

export type EmailSettings = Tables<"email_settings">;

// Admins only: how sending behaves on this project (off, test redirect or live).
export function useEmailSettings() {
  return useQuery({
    queryKey: keys.emailSettings,
    queryFn: async (): Promise<EmailSettings | null> => {
      const { data, error } = await supabase.from("email_settings").select("*").maybeSingle();
      if (error) throw new DbError(error);
      return data;
    },
  });
}

// Badge colours admins chose on the Status colors page, read by everyone signed in.
// "order:received" -> "#ffa94d"; a status that isn't listed keeps the app's built-in colour.
// The admin Dashboard's numbers, counted by the database (see the dashboard_counts migration)
// so the Dashboard doesn't load whole tables to count them.
export type DashboardCounts = {
  orders: number;
  order_statuses: Record<string, number>;
  new_order_requests: number;
  open_leads: number;
  athletes: number;
  organizations: number;
  contacts: number;
  links: number;
  contacts_without_organization: number;
};

export function useDashboardCounts() {
  return useQuery({
    queryKey: keys.dashboardCounts,
    queryFn: async () => unwrap(await supabase.rpc("dashboard_counts")) as DashboardCounts,
  });
}

export type StatusColors = Record<string, string>;
export const statusColorKey = (kind: "order" | "production", status: string) => `${kind}:${status}`;

export function useStatusColors() {
  return useQuery({
    queryKey: keys.statusColors,
    queryFn: async (): Promise<StatusColors> => {
      const { data, error } = await supabase.from("status_colors").select("kind, status, background");
      if (error) throw new DbError(error);
      return Object.fromEntries(data.map((c) => [statusColorKey(c.kind as "order" | "production", c.status), c.background]));
    },
    // They rarely change; a badge doesn't need to refetch them on every page.
    staleTime: 5 * 60_000,
  });
}

export type Scrapbook = { body: string; updated_at: string };

// The signed-in user's scrapbook, or null before they first write in it. Nobody else's is visible to them.
export function useScrapbook() {
  return useQuery({
    queryKey: keys.scrapbook,
    queryFn: async (): Promise<Scrapbook | null> => {
      const { data, error } = await supabase.from("scrapbooks").select("body, updated_at").maybeSingle();
      if (error) throw new DbError(error);
      return data;
    },
  });
}

export function useDismissals() {
  return useQuery({
    queryKey: keys.dismissals,
    queryFn: async (): Promise<Set<string>> =>
      new Set(unwrap(await supabase.from("note_dismissals").select("note_id")).map((d) => d.note_id)),
  });
}

// Every account, with when it last signed in. Sign-in times live in Supabase's auth records;
// the user_last_sign_ins database function returns them to admins only.
export function useUsers() {
  return useQuery({
    queryKey: keys.users,
    queryFn: async (): Promise<User[]> => {
      const [users, signIns] = await Promise.all([
        supabase.from("profiles").select("id, email, first_name, last_name, muted_email_kinds, role, factory_id, organization_id, created_at, disabled_at").order("email"),
        supabase.rpc("user_last_sign_ins"),
      ]);
      const lastSignIn = new Map(unwrap(signIns).map((s) => [s.id, s.last_sign_in_at]));
      return unwrap(users).map((u) => ({ ...u, role: u.role as Role, last_sign_in_at: lastSignIn.get(u.id) ?? null }));
    },
  });
}
