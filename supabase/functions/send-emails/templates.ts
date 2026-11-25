// The email templates: what each kind of email says and looks like.
//
// Used by the send-emails function to write each email, and by the app's Email Settings page to preview
// them, so the preview is always the real thing. Plain TypeScript only: it runs on Deno and in the browser.

export type Kind =
  | "order_assigned"
  | "order_shipped"
  | "order_request"
  | "quote_request"
  | "athlete_note_added"
  | "order_note_from_factory"
  | "order_note_from_admin";
export type Details = Record<string, string | number | null>;

// What a template needs to know about the email it writes.
export type EmailFacts = {
  kind: Kind;
  order_id: string | null;
  order_request_id: string | null;
  lead_id: string | null;
  // A sample has made-up details, and its button opens the Dashboard's home page.
  sample: boolean;
  details: Details | null;
};

export type Message = { subject: string; html: string; text: string };

// Must match src/lib/constants.ts.
const ORDER_STATUSES: Record<string, string> = {
  received: "Received",
  accepted: "Accepted",
  in_production: "In production",
  shipped: "Shipped",
  cancelled: "Cancelled",
};

// Everything from the database is escaped: quote requests come from a public page.
const escape = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const day = (value: unknown) =>
  value ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";

const isLink = (value: unknown) => typeof value === "string" && /^https?:\/\//i.test(value);

type Row = [label: string, value: unknown, link?: boolean];

// One email: a heading, a few lines of text, a table of details and a button into the Dashboard.
function layout(title: string, intro: string[], rows: Row[], button: { label: string; url: string }) {
  const shown = rows.filter(([, value]) => value !== null && value !== undefined && value !== "");
  const html = `<!doctype html><html><body style="margin:0;background:#f1f3f5;font-family:Segoe UI,Arial,sans-serif;color:#002138">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f3f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="background:#002138;padding:18px 24px;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:2px">MARGEN<span style="display:block;height:3px;width:40px;background:#7ef84d;margin-top:8px"></span></td></tr>
<tr><td style="padding:24px">
<h1 style="font-size:20px;margin:0 0 12px">${escape(title)}</h1>
${intro.map((line) => `<p style="margin:0 0 10px;line-height:1.5">${escape(line)}</p>`).join("")}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 20px;border-collapse:collapse;width:100%">
${shown
  .map(
    ([label, value, link]) =>
      `<tr><td style="padding:6px 12px 6px 0;color:#4f6b79;white-space:nowrap;vertical-align:top">${escape(label)}</td><td style="padding:6px 0;font-weight:600">${
        link && isLink(value) ? `<a href="${escape(value)}" style="color:#002138">${escape(value)}</a>` : escape(value).replace(/\n/g, "<br>")
      }</td></tr>`,
  )
  .join("")}
</table>
<a href="${escape(button.url)}" style="display:inline-block;background:#002138;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:6px">${escape(button.label)}</a>
</td></tr>
<tr><td style="padding:14px 24px;color:#4f6b79;font-size:12px;border-top:1px solid #dbe2e7">Sent automatically by the MARGEN Dashboard.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [title, "", ...intro, "", ...shown.map(([label, value]) => `${label}: ${value}`), "", `${button.label}: ${button.url}`].join("\n");
  return { html, text };
}

// Writes one email. A sample uses made-up details (only the greeting's first name is real) and says so in its subject.
export function write(email: EmailFacts, appUrl: string, today = new Date()): Message {
  const d = email.sample ? { ...sampleDetails(today), first_name: email.details?.first_name ?? null } : (email.details ?? {});
  const hello = d.first_name ? `Hello ${d.first_name},` : "Hello,";
  const open = (path: string) => (email.sample ? `${appUrl}/` : `${appUrl}/#/${path}`);
  const order = open(`customs/${email.order_id}`);
  const message = (() => {
    switch (email.kind) {
      // To the factory's default contact. Factories don't see client details, so none are included.
      case "order_assigned":
        return {
          subject: `New MARGEN order ${d.margen_order_id} for ${d.factory_name}`,
          ...layout(
            `Order ${d.margen_order_id} is assigned to ${d.factory_name}`,
            [hello, "MARGEN has assigned a new order to your factory. Open it in the Dashboard to see its items and sizes."],
            [
              ["Margen order ID", d.margen_order_id],
              ["Factory order ID", d.factory_order_id],
              ["Order status", ORDER_STATUSES[String(d.order_status)] ?? d.order_status],
              ["Pieces", d.pieces],
              ["Estimated shipping", day(d.estimated_ship_date)],
            ],
            { label: "Open the order", url: order },
          ),
        };
      // To the organization's default contact. Clients don't see factory details, so none are included.
      case "order_shipped":
        return {
          subject: `Your MARGEN order ${d.margen_order_id} has shipped`,
          ...layout(
            `Order ${d.margen_order_id} has shipped`,
            [hello, `Good news: your order for ${d.organization_name} is on its way.`],
            [
              ["Order", d.margen_order_id],
              ["Pieces", d.pieces],
              ["Shipped on", day(d.actual_ship_date)],
              ["Shipping method", d.shipping_method],
              ["Tracker", d.tracking_number, true],
            ],
            { label: "See your order", url: order },
          ),
        };
      // To the admins.
      case "order_request":
        return {
          subject: `New order request from ${d.organization_name}`,
          ...layout(
            `New order request from ${d.organization_name}`,
            [hello, "A client sent an order request from the Order Entry page."],
            [
              ["Organization", d.organization_name],
              ["Contact", d.contact_name],
              ["Email", d.email],
              ["Phone", d.phone],
              ["Pieces", d.pieces],
              ["Notes", d.notes],
            ],
            { label: "Review the request", url: open(`order-requests/${email.order_request_id}`) },
          ),
        };
      // To the admins: someone asked for a quote on the public page. It is saved as a lead.
      case "quote_request":
        return {
          subject: `New quote request from ${d.organization_name || d.contact_name}`,
          ...layout(
            `New quote request from ${d.organization_name || d.contact_name}`,
            [hello, "Someone asked for a quote on the MARGEN website. They are now on the Leads page."],
            [
              ["Name", d.contact_name],
              ["Organization", d.organization_name],
              ["Email", d.email],
              ["Phone", d.phone],
              ["Country", d.country],
              ["Message", d.notes],
            ],
            { label: "Open the lead", url: open(`leads/${email.lead_id}`) },
          ),
        };
      // To the admins, except the one who made the change.
      case "athlete_note_added": {
        return {
          subject: `New note for ${d.athlete_name}`,
          ...layout(
            `New note for ${d.athlete_name}`,
            [hello, `A note was added for the athlete ${d.athlete_name}.`],
            [
              ["Athlete", d.athlete_name],
              ["Note", d.body],
              ["Written by", d.written_by],
            ],
            { label: "Open the athlete", url: open(`athletes/${d.athlete_id}`) },
          ),
        };
      }
      // To the admins: the factory added a note to one of its orders.
      case "order_note_from_factory":
        return {
          subject: `${d.factory_name} added a note to order ${d.margen_order_id}`,
          ...layout(
            `Note from ${d.factory_name} on order ${d.margen_order_id}`,
            [hello, `${d.factory_name} added a note to order ${d.margen_order_id}.`],
            [
              ["Order", d.margen_order_id],
              ["Factory order ID", d.factory_order_id],
              ["Note", d.body],
              ["Written by", d.written_by],
            ],
            { label: "Open the order", url: open(`customs/${d.order_id}`) },
          ),
        };
      // To the factory's default contact: MARGEN added a note to one of the factory's orders. No client details.
      case "order_note_from_admin":
        return {
          subject: `MARGEN added a note to order ${d.margen_order_id}`,
          ...layout(
            `Note from MARGEN on order ${d.margen_order_id}`,
            [hello, `MARGEN added a note to order ${d.margen_order_id}. You can reply with a note on the order in the Dashboard.`],
            [
              ["Order", d.margen_order_id],
              ["Factory order ID", d.factory_order_id],
              ["Note", d.body],
              ["Written by", d.written_by],
            ],
            { label: "Open the order", url: open(`customs/${d.order_id}`) },
          ),
        };
    }
  })();
  return email.sample ? { ...message, subject: `[Sample] ${message.subject}` } : message;
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

// The made-up details of sample emails and previews. Each kind uses the ones it needs.
export function sampleDetails(today = new Date()): Details {
  return {
    margen_order_id: "SAMPLE-001",
    factory_order_id: "F-1001",
    order_status: "accepted",
    pieces: 48,
    estimated_ship_date: isoDay(new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)),
    actual_ship_date: isoDay(today),
    shipping_method: "DHL Express",
    tracking_number: "https://www.dhl.com/track?id=SAMPLE001",
    factory_name: "Sample Factory",
    organization_name: "Sample Rowing Club",
    contact_name: "Alex Sample",
    email: "alex@example.com",
    phone: "+33 6 00 00 00 00",
    country: "France",
    notes: "This is a sample email. Nothing was ordered or requested.",
    athlete_id: null,
    order_id: null,
    athlete_name: "Sam Sample",
    body: "This is a sample email. No note was added.",
    written_by: "Alex Sample",
  };
}
