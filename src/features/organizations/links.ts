import { expectRows, useDbAction } from "../../data/mutations";
import { supabase, unwrap } from "../../lib/supabase";

// Links between contacts and an organization or a factory, used from both sides' pages.
// Each organization and factory has at most one default contact, who gets its emails.
export type LinkOwner = "organization" | "factory";
export type Link = { owner: LinkOwner; owner_id: string; contact_id: string };

// Both link tables have the same shape; only the owner's column differs.
type LinkTable = {
  insert: (row: object) => PromiseLike<Parameters<typeof unwrap<null>>[0]>;
  update: (row: object) => Filtered;
  delete: () => Filtered;
};
type Filtered = {
  eq: (column: string, value: string) => {
    eq: (column: string, value: string) => { select: (columns: string) => PromiseLike<Parameters<typeof unwrap<unknown[]>>[0]> };
  };
};
const table = (l: Link) => supabase.from(l.owner === "factory" ? "factory_contacts" : "organization_contacts") as unknown as LinkTable;
const ownerColumn = (l: Link) => (l.owner === "factory" ? "factory_id" : "organization_id");

export function useLinkActions() {
  const link = useDbAction({
    tables: ["organization_contacts", "factory_contacts"],
    run: async (l: Link) => unwrap(await table(l).insert({ [ownerColumn(l)]: l.owner_id, contact_id: l.contact_id })),
    success: () => null,
    failure: () => "Couldn't link them",
  });

  // The database moves the flag off the previous default contact.
  const makeDefault = useDbAction({
    tables: ["organization_contacts", "factory_contacts"],
    run: async (l: Link) =>
      expectRows(
        unwrap(await table(l).update({ is_default: true }).eq(ownerColumn(l), l.owner_id).eq("contact_id", l.contact_id).select("contact_id")),
        "The default contact wasn't changed. You may not have permission.",
      ),
    success: () => null,
    failure: () => "Couldn't set the default contact",
  });

  const unlink = useDbAction({
    tables: ["organization_contacts", "factory_contacts"],
    run: async (l: Link) =>
      expectRows(
        unwrap(await table(l).delete().eq(ownerColumn(l), l.owner_id).eq("contact_id", l.contact_id).select("contact_id")),
        "The contact wasn't unlinked. You may not have permission.",
      ),
    success: () => null,
    failure: () => "Couldn't unlink them",
  });

  return { link, makeDefault, unlink };
}

// Which link a pending action is for, so only that row's button is disabled.
export const isBusyWith = (action: { isPending: boolean; variables?: Link }, l: Link) =>
  action.isPending &&
  action.variables?.owner === l.owner &&
  action.variables?.owner_id === l.owner_id &&
  action.variables?.contact_id === l.contact_id;
