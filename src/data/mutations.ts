import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useNotice } from "../components/Notice";
import type { Database } from "../lib/database.types";
import { isDuplicate, messageOf, supabase, unwrap } from "../lib/supabase";
import { keys } from "./queries";

type TableName = keyof Database["public"]["Tables"];

// Which cached queries a change to each table can affect. Lists embed data from other tables
// (an order shows its organization's and factory's names, an item its piece counts, an order its history),
// so those are refetched too. Add a line here when a new table or embed is added.
const INVALIDATES: Record<TableName, readonly (readonly string[])[]> = {
  organizations: [keys.organizations, keys.contacts, keys.orders],
  contacts: [keys.contacts, keys.organizations, keys.notes],
  organization_contacts: [keys.organizations, keys.contacts],
  athletes: [keys.athletes, keys.notes],
  leads: [keys.leads],
  orders: [keys.orders, keys.orderItems, keys.orderEvents],
  order_items: [keys.orderItems, keys.orderEvents],
  order_events: [keys.orderEvents],
  items: [keys.items, keys.orderItems],
  factories: [keys.factories, keys.orders, keys.notes],
  notes: [keys.notes],
  note_dismissals: [keys.dismissals],
  profiles: [keys.users, ["profile"]],
};

export const invalidate = (queryClient: QueryClient, table: TableName) =>
  Promise.all(INVALIDATES[table].map((queryKey) => queryClient.invalidateQueries({ queryKey })));

// A write that matched no rows: row level security hid them, or they were already gone.
export class NotChanged extends Error {}

export function expectRows(rows: unknown[], message: string) {
  if (!rows.length) throw new NotChanged(message);
}

// Tables edited through a record's own form, and the menu page each one lives under.
export type RecordTable = "organizations" | "contacts" | "athletes" | "leads" | "orders" | "items" | "factories";
const ROUTES: Record<RecordTable, string> = {
  organizations: "organizations",
  contacts: "contacts",
  athletes: "athletes",
  leads: "leads",
  orders: "customs",
  items: "items",
  factories: "factories",
};
export const routeFor = (table: RecordTable) => `/${ROUTES[table]}`;

// The forms build each row from the table's own columns; one loosely typed client keeps a
// single save and delete for every table instead of one near-identical copy per table.
type LooseTable = {
  insert: (row: object) => { select: (columns: string) => { single: () => PromiseLike<SingleResult> } };
  update: (row: object) => {
    eq: (column: string, value: string) => {
      select: (columns: string) => PromiseLike<ManyResult> & { single: () => PromiseLike<SingleResult> };
    };
  };
  delete: () => { eq: (column: string, value: string) => { select: (columns: string) => PromiseLike<ManyResult> } };
};
type SingleResult = Parameters<typeof unwrap<{ id: string }>>[0];
type ManyResult = Parameters<typeof unwrap<{ id: string }[]>>[0];
const table = (name: RecordTable) => supabase.from(name) as unknown as LooseTable;

// Inserts a new row, or updates the existing one when an id is given. Returns the row's id.
export async function saveRow(name: RecordTable, row: object, id?: string) {
  const query = id ? table(name).update(row).eq("id", id).select("id").single() : table(name).insert(row).select("id").single();
  return unwrap(await query).id;
}

export async function deleteRow(name: RecordTable, id: string, label: string) {
  const rows = unwrap(await table(name).delete().eq("id", id).select("id"));
  expectRows(rows, `${label} wasn't deleted. You may not have permission.`);
}

// Saves a record from its form, then opens its page with "Added …" or "Saved …".
export function useSaveRecord(name: RecordTable) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { notify } = useNotice();
  return useMutation({
    mutationFn: ({ row, id }: { row: object; id?: string; label: string }) => saveRow(name, row, id),
    onSuccess: async (savedId, { id, label }) => {
      await invalidate(queryClient, name);
      notify("success", id ? `Saved ${label}.` : `Added ${label}.`, { keep: true });
      navigate(`${routeFor(name)}/${savedId}`);
    },
    onError: (error, { label }) =>
      notify(
        "error",
        isDuplicate(error)
          ? `Couldn't save ${label}: that ID is already used by another record.`
          : `Couldn't save ${label}: ${messageOf(error)}`,
      ),
  });
}

// Deletes a record after the caller has confirmed, then goes back to its list.
export function useDeleteRecord(name: RecordTable) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { notify } = useNotice();
  return useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) => deleteRow(name, id, label),
    onSuccess: async (_, { label }) => {
      notify("success", `Deleted ${label}.`, { keep: true });
      navigate(routeFor(name));
      await invalidate(queryClient, name);
    },
    onError: (error, { label }) =>
      notify("error", error instanceof NotChanged ? error.message : `Couldn't delete ${label}: ${messageOf(error)}`),
  });
}

// A smaller change made in place (a status, a link, a quantity). After it succeeds the affected
// data is refetched and success() is shown; null clears any notice, undefined leaves it.
export function useDbAction<V>({
  tables,
  run,
  success,
  failure,
}: {
  tables: TableName[];
  run: (variables: V) => Promise<unknown>;
  success?: (variables: V) => string | null | undefined;
  failure: (variables: V) => string;
}) {
  const queryClient = useQueryClient();
  const { notify, clear } = useNotice();
  return useMutation({
    mutationFn: run,
    onSuccess: async (_, variables) => {
      await Promise.all(tables.map((t) => invalidate(queryClient, t)));
      const text = success?.(variables);
      if (text) notify("success", text);
      else if (text === null) clear();
    },
    onError: (error, variables) =>
      notify("error", error instanceof NotChanged ? error.message : `${failure(variables)}: ${messageOf(error)}`),
  });
}
