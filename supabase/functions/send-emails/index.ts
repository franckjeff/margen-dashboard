// Sends the emails waiting in the email outbox (public.email_outbox), through Resend.
//
// A scheduled job in the database calls this every minute while emails are due, with a shared secret
// from the database's vault. The database hands over the due emails with claim_due_emails() and is told
// how each one went with finish_email(); both check the same secret. Failures are tried again later.
//
// Needs the RESEND_API_KEY function secret. Until it's set, nothing is sent and emails wait.
// The email settings (public.email_settings) say whether to send, to whom on MARGEN TEST, and the sender.
import { createClient } from "npm:@supabase/supabase-js@2";

type Settings = { mode: "off" | "redirect" | "live"; redirect_to: string | null; from_address: string; app_url: string };
type Details = Record<string, string | number | null>;
type Email = {
  id: string;
  kind: "order_assigned" | "order_shipped" | "order_request" | "quote_request";
  order_id: string | null;
  order_request_id: string | null;
  lead_id: string | null;
  recipient_email: string;
  details: Details | null;
};

// Must match src/lib/constants.ts.
const ORDER_STATUSES: Record<string, string> = {
  received: "Received",
  accepted: "Accepted",
  in_production: "In production",
  done: "Done",
  on_hold: "On hold",
  cancelled: "Cancelled",
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

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

function write(email: Email, appUrl: string) {
  const d = email.details ?? {};
  const hello = d.first_name ? `Hello ${d.first_name},` : "Hello,";
  const order = `${appUrl}/#/customs/${email.order_id}`;
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
          { label: "Review the request", url: `${appUrl}/#/order-requests/${email.order_request_id}` },
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
          { label: "Open the lead", url: `${appUrl}/#/leads/${email.lead_id}` },
        ),
      };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "Use POST." });
  const secret = req.headers.get("x-sender-secret") ?? "";
  if (!secret) return reply(401, { error: "Not allowed." });
  const apiKey = Deno.env.get("RESEND_API_KEY");
  // Checked before claiming anything, so emails keep waiting until the key is set.
  if (!apiKey) return reply(503, { error: "RESEND_API_KEY isn't set, so no emails were sent." });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await db.rpc("claim_due_emails", { secret, batch: 20 });
  if (error) return reply(error.code === "42501" ? 401 : 500, { error: error.message });
  const { settings, emails } = data as { settings: Settings; emails: Email[] };
  const appUrl = settings.app_url.replace(/\/+$/, "");

  let sent = 0;
  for (const email of emails) {
    let providerId: string | null = null;
    let failure: string | null = null;
    try {
      if (!email.details) throw new Error("The order, request or lead no longer exists.");
      const message = write(email, appUrl);
      // On MARGEN TEST every email goes to one address, its subject saying who it was for.
      const redirect = settings.mode === "redirect";
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // Resend sends a message only once per key, so a retry after a timeout can't send it twice.
          "Idempotency-Key": `email-outbox-${email.id}`,
        },
        body: JSON.stringify({
          from: settings.from_address,
          to: [redirect ? settings.redirect_to : email.recipient_email],
          subject: redirect ? `[TEST for ${email.recipient_email}] ${message.subject}` : message.subject,
          html: message.html,
          text: message.text,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message ?? `Resend answered ${response.status}.`);
      providerId = result?.id ?? null;
      sent++;
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
    }
    await db.rpc("finish_email", { secret, email_id: email.id, provider_id: providerId, error: failure });
  }
  return reply(200, { claimed: emails.length, sent });
});
