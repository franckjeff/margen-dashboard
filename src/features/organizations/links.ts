import { expectRows, useDbAction } from "../../data/mutations";
import { supabase, unwrap } from "../../lib/supabase";

// Links between organizations and contacts, used from both sides' pages.
type Link = { organization_id: string; contact_id: string };

export function useLinkActions() {
  const link = useDbAction({
    tables: ["organization_contacts"],
    run: async (l: Link) => unwrap(await supabase.from("organization_contacts").insert(l)),
    success: () => null,
    failure: () => "Couldn't link them",
  });

  // The database moves the flag off the previous default contact.
  const makeDefault = useDbAction({
    tables: ["organization_contacts"],
    run: async ({ organization_id, contact_id }: Link) =>
      expectRows(
        unwrap(
          await supabase
            .from("organization_contacts")
            .update({ is_default: true })
            .eq("organization_id", organization_id)
            .eq("contact_id", contact_id)
            .select("contact_id"),
        ),
        "The default contact wasn't changed. You may not have permission.",
      ),
    success: () => null,
    failure: () => "Couldn't set the default contact",
  });

  const unlink = useDbAction({
    tables: ["organization_contacts"],
    run: async ({ organization_id, contact_id }: Link) =>
      unwrap(
        await supabase.from("organization_contacts").delete().eq("organization_id", organization_id).eq("contact_id", contact_id),
      ),
    success: () => null,
    failure: () => "Couldn't unlink them",
  });

  return { link, makeDefault, unlink };
}

// Which link a pending action is for, so only that row's button is disabled.
export const isBusyWith = (action: { isPending: boolean; variables?: Link }, l: Link) =>
  action.isPending && action.variables?.organization_id === l.organization_id && action.variables?.contact_id === l.contact_id;
