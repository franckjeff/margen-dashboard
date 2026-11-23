// Sends the emails waiting in the email outbox (public.email_outbox), through Resend.
//
// A scheduled job in the database calls this every minute while emails are due, with a shared secret
// from the database's vault. The database hands over the due emails with claim_due_emails() and is told
// how each one went with finish_email(); both check the same secret. Failures are tried again later.
//
// Needs the RESEND_API_KEY function secret. Until it's set, nothing is sent and emails wait.
// The email settings (public.email_settings) say whether to send, to whom on MARGEN TEST, and the sender.
// What each email says is in templates.ts.
import { createClient } from "npm:@supabase/supabase-js@2";
import { write, type EmailFacts } from "./templates.ts";

type Settings = { mode: "off" | "redirect" | "live"; redirect_to: string | null; from_address: string; app_url: string };
type Email = EmailFacts & { id: string; recipient_email: string };

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

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
      if (!email.details) throw new Error("The order, request, lead or note no longer exists.");
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
