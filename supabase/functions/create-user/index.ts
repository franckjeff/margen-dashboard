// Creates a sign-in account from the app's Users page. Only admins may call it.
//
// Creating accounts needs the project's secret key, which must never reach the browser, so it runs
// here on Supabase's servers. The new account gets its profile from the on_auth_user_created trigger,
// then this sets its access level, first and last name, and the factory or organization it's linked to.
//
// The account gets a temporary password: the one the admin typed, or a made-up one. A welcome email gives it to the
// person (welcome.ts), following the email settings like every other email: to everyone on MARGEN PROD, to the test
// address on MARGEN TEST, to nobody when emails are off or paused. It's sent straight away and never stored. The
// profile is marked must_change_password, so the app makes them choose their own password when they first sign in.
// When the email can't be sent, the reply says why, and includes a made-up password so the admin can pass it on.
import { createClient } from "npm:@supabase/supabase-js@2";
import { welcomeEmail } from "./welcome.ts";

const ROLES = ["admin", "factory", "client"];
const MIN_PASSWORD = 8;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Readable temporary passwords: no 0/O, 1/l/I.
const PASSWORD_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const makePassword = (length = 12) =>
  Array.from(crypto.getRandomValues(new Uint32Array(length)), (n) => PASSWORD_LETTERS[n % PASSWORD_LETTERS.length]).join("");

type EmailSettings = { mode: string; redirect_to: string | null; from_address: string; app_url: string; paused: boolean };

// Sends the welcome email through Resend. Returns null when it went, or why it didn't.
async function sendWelcome(settings: EmailSettings | null, to: string, firstName: string, password: string): Promise<string | null> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return "emails aren't set up yet (no Resend key)";
  if (!settings || settings.mode === "off") return "emails are turned off";
  if (settings.paused) return "sending emails is paused";
  const redirect = settings.mode === "redirect";
  if (redirect && !settings.redirect_to) return "MARGEN TEST has no test address to send emails to";
  const message = welcomeEmail({ firstName, email: to, password, appUrl: settings.app_url.replace(/\/+$/, "") });
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: settings.from_address,
        // On MARGEN TEST every email goes to one address, its subject saying who it was for.
        to: [redirect ? settings.redirect_to : to],
        subject: redirect ? `[TEST for ${to}] ${message.subject}` : message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    if (response.ok) return null;
    const result = await response.json().catch(() => ({}));
    return `the email service answered: ${result?.message ?? response.status}`;
  } catch (error) {
    return `the email service couldn't be reached (${error instanceof Error ? error.message : String(error)})`;
  }
}

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Request = {
  email?: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  factory_id?: string | null;
  organization_id?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Use POST." });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Who is asking: their sign-in token must be valid and their profile must be an admin's.
  const token = req.headers.get("Authorization")?.replace(/^Bearer /i, "") ?? "";
  const { data: caller } = await admin.auth.getUser(token);
  if (!caller.user) return reply(401, { error: "Sign in again, then try once more." });
  const { data: callerProfile } = await admin.from("profiles").select("role").eq("id", caller.user.id).maybeSingle();
  if (callerProfile?.role !== "admin") return reply(403, { error: "Only admins can add users." });

  let body: Request;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "The request wasn't readable." });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const typed = body.password ?? "";
  const role = body.role ?? "client";
  const firstName = body.first_name?.trim() ?? "";
  const lastName = body.last_name?.trim() ?? "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(400, { error: "Enter a valid email address." });
  if (!firstName || !lastName) return reply(400, { error: "Enter a first and last name." });
  if (firstName.length > 100 || lastName.length > 100) return reply(400, { error: "The name is too long." });
  if (!ROLES.includes(role)) return reply(400, { error: "Choose an access level." });
  // A Factory account is always added with its factory, a Client account with its organization.
  if (role === "factory" && !body.factory_id) return reply(400, { error: "Choose the factory this account belongs to." });
  if (role === "client" && !body.organization_id) return reply(400, { error: "Choose the organization this account belongs to." });
  if (typed && typed.length < MIN_PASSWORD) return reply(400, { error: `The password needs at least ${MIN_PASSWORD} characters.` });
  const password = typed || makePassword();

  // Confirmed straight away: an admin vouches for the address, so no confirmation email is sent.
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });
  if (error || !created.user) {
    const taken = error?.status === 422 || /already/i.test(error?.message ?? "");
    return reply(taken ? 409 : 400, { error: taken ? `${email} already has an account.` : error?.message ?? "The account wasn't created." });
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      role,
      first_name: firstName,
      last_name: lastName,
      factory_id: role === "factory" ? body.factory_id : null,
      organization_id: role === "client" ? body.organization_id : null,
      must_change_password: true,
    })
    .eq("id", created.user.id);
  if (profileError) {
    // Don't leave a half-made account behind.
    await admin.auth.admin.deleteUser(created.user.id);
    return reply(400, { error: profileError.message });
  }

  const { data: settings } = await admin.from("email_settings").select("mode, redirect_to, from_address, app_url, paused").maybeSingle();
  const notSent = await sendWelcome(settings as EmailSettings | null, email, firstName, password);
  return reply(200, {
    id: created.user.id,
    email,
    emailed: !notSent,
    ...(notSent ? { not_sent: notSent } : {}),
    // Only when nobody else knows it: the admin passes it on themselves.
    ...(notSent && !typed ? { password } : {}),
  });
});
