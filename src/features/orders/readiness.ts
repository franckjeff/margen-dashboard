import type { LinkedContact, Order, OrderLine } from "../../data/queries";

// One thing checked before a Received order is accepted.
export type ReadinessCheck = {
  label: string;
  ok: boolean;
  // Needed: the order can't sensibly be accepted without it. Otherwise it's worth fixing, but doesn't block.
  needed: boolean;
  // Shown when the check fails: what's missing and where to fix it.
  missing: string;
};

type Context = {
  lines: OrderLine[];
  // The order's organization's and factory's linked contacts, or undefined when the order has none.
  organizationContacts?: LinkedContact[];
  factoryContacts?: LinkedContact[];
};

const defaultEmail = (contacts?: LinkedContact[]) => contacts?.find((c) => c.is_default)?.email ?? null;

// Whether a Received order seems to have everything it needs to be Accepted.
export function readinessOf(order: Order, { lines, organizationContacts, factoryContacts }: Context): ReadinessCheck[] {
  const ownLines = lines.filter((l) => l.order_id === order.id);
  const pieces = ownLines.reduce((sum, l) => sum + l.quantity, 0);
  const checks: (ReadinessCheck | false)[] = [
    {
      label: "Organization",
      ok: Boolean(order.organization_id),
      needed: true,
      missing: "No organization: choose who the order is for (Edit).",
    },
    {
      label: "Factory",
      ok: Boolean(order.factory_id),
      needed: true,
      missing: "No factory: assign one with the Factory menu above.",
    },
    {
      label: "Items",
      ok: pieces > 0,
      needed: true,
      missing: "No items: add the order's lines under Items.",
    },
    {
      label: "Estimated shipping date",
      ok: Boolean(order.estimated_ship_date),
      needed: false,
      missing: "No estimated shipping date yet (Edit).",
    },
    // Emails are only checked once there's an organization or factory to email.
    Boolean(order.organization_id) && {
      label: "Organization email",
      ok: Boolean(defaultEmail(organizationContacts)),
      needed: false,
      missing: "The organization's default contact has no email, so they won't be told when the order ships.",
    },
    Boolean(order.factory_id) && {
      label: "Factory email",
      ok: Boolean(defaultEmail(factoryContacts)),
      needed: false,
      missing: "The factory's default contact has no email, so the factory won't be emailed about the order.",
    },
  ];
  return checks.filter((c): c is ReadinessCheck => Boolean(c));
}

export const isReady = (checks: ReadinessCheck[]) => checks.every((c) => c.ok || !c.needed);
