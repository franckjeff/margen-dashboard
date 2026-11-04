import { useQuery } from "@tanstack/react-query";
import { ADDRESS_FIELDS, type Role } from "../lib/constants";
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
  users: ["users"] as const,
};

export type Profile = { role: Role | null; firstName: string | null };
export type LinkedContact = Pick<Tables<"contacts">, "id" | "first_name" | "last_name" | "city" | "country"> & { is_default: boolean };
export type LinkedOrganization = Pick<Tables<"organizations">, "id" | "name" | "state" | "country"> & { is_default: boolean };
export type Organization = Tables<"organizations"> & { contacts: LinkedContact[] };
export type Contact = Tables<"contacts"> & { organizations: LinkedOrganization[] };
export type Athlete = Tables<"athletes">;
export type Lead = Tables<"leads">;
export type Order = Omit<Tables<"orders">, "created_at"> & {
  created_at: string;
  organization: { id: string; name: string } | null;
  factory: { id: string; name: string } | null;
};
export type Item = Tables<"items">;
export type Factory = Tables<"factories">;
export type OrderLine = Pick<Tables<"order_items">, "id" | "order_id" | "item_id" | "size" | "quantity">;
export type OrderEvent = Pick<Tables<"order_events">, "id" | "order_id" | "action" | "changed_at"> & {
  changes: Record<string, { from?: unknown; to?: unknown }>;
  author: { email: string | null } | null;
};
export type Note = Pick<Tables<"notes">, "id" | "contact_id" | "athlete_id" | "factory_id" | "organization_id" | "body" | "created_at"> & {
  author: { email: string | null } | null;
};
export type User = Pick<Tables<"profiles">, "id" | "email" | "first_name" | "factory_id" | "created_at"> & {
  role: Role;
  last_sign_in_at: string | null;
};

// The signed-in user's access level and first name. A missing profile row means no access.
export function useProfile(userId: string) {
  return useQuery({
    queryKey: keys.profile(userId),
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.from("profiles").select("role, first_name").eq("id", userId).maybeSingle();
      if (error) throw new DbError(error);
      return { role: (data?.role as Role | undefined) ?? null, firstName: data?.first_name ?? null };
    },
  });
}

export function useOrganizations() {
  return useQuery({
    queryKey: keys.organizations,
    queryFn: async (): Promise<Organization[]> => {
      const rows = unwrap(
        await supabase
          .from("organizations")
          .select("id, name, state, country, created_at, organization_contacts(is_default, contacts(id, first_name, last_name, city, country))")
          .order("name"),
      );
      // Flatten the link rows so each linked contact carries the link's is_default flag.
      return rows.map(({ organization_contacts: links, ...o }) => ({
        ...o,
        contacts: links
          .filter((l) => l.contacts)
          .map((l) => ({ ...l.contacts!, is_default: l.is_default }))
          .sort(byPerson),
      }));
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
            `id, first_name, last_name, created_at, ${ADDRESS_FIELDS.join(", ")}, organization_contacts(is_default, organizations(id, name, state, country))`,
          )
          .order("last_name")
          .order("first_name"),
      ) as unknown as (Tables<"contacts"> & {
        organization_contacts: { is_default: boolean; organizations: Omit<LinkedOrganization, "is_default"> | null }[];
      })[];
      return rows.map(({ organization_contacts: links, ...c }) => ({
        ...c,
        organizations: links
          .filter((l) => l.organizations)
          .map((l) => ({ ...l.organizations!, is_default: l.is_default }))
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
            "id, margen_order_id, factory_order_id, order_status, production_status, organization_id, factory_id, estimated_ship_date, actual_ship_date, shipping_method, tracking_number, created_at, organization:organizations(id, name), factory:factories(id, name)",
          )
          .order("created_at", { ascending: false }),
      ),
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
          .select("id, order_id, action, changes, changed_at, author:profiles(email)")
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
    queryFn: async (): Promise<Factory[]> =>
      unwrap(
        await supabase
          .from("factories")
          .select("id, name, contact_name, country, description, created_at")
          .order("name"),
      ),
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
          .select("id, contact_id, athlete_id, factory_id, organization_id, body, created_at, author:profiles!notes_created_by_fkey(email)")
          .order("created_at", { ascending: false }),
      ),
  });
}

// Ids of notes this user has hidden from the Dashboard. Only their own dismissals are visible to them.
export type OrderRequestLine = Pick<Tables<"order_request_lines">, "id" | "item_id" | "size" | "quantity"> & { item: { name: string } | null };
export type OrderRequest = Tables<"order_requests"> & { lines: OrderRequestLine[] };

// Order requests sent from the public Order Entry page, newest first, with their lines. Admins only.
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

export type AppError = Tables<"app_errors">;

// Errors users hit in the last 90 days, most recent first. Only admins can read them.
export function useAppErrors() {
  return useQuery({
    queryKey: keys.appErrors,
    queryFn: async (): Promise<AppError[]> =>
      unwrap(await supabase.from("app_errors").select("*").order("last_seen_at", { ascending: false }).limit(200)),
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
        supabase.from("profiles").select("id, email, first_name, role, factory_id, created_at").order("email"),
        supabase.rpc("user_last_sign_ins"),
      ]);
      const lastSignIn = new Map(unwrap(signIns).map((s) => [s.id, s.last_sign_in_at]));
      return unwrap(users).map((u) => ({ ...u, role: u.role as Role, last_sign_in_at: lastSignIn.get(u.id) ?? null }));
    },
  });
}
