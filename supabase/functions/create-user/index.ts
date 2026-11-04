// Creates a sign-in account from the app's Users page. Only admins may call it.
//
// Creating accounts needs the project's secret key, which must never reach the browser, so it runs
// here on Supabase's servers. The new account gets its profile from the on_auth_user_created trigger,
// then this sets its access level, first name, and the factory or organization it's linked to.
//
// Without a password, the person chooses one with "Forgot your password?" on the sign-in page.
import { createClient } from "npm:@supabase/supabase-js@2";

const ROLES = ["admin", "factory", "client", "designer"];
const MIN_PASSWORD = 8;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Request = {
  email?: string;
  password?: string;
  first_name?: string;
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
  const password = body.password ?? "";
  const role = body.role ?? "client";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(400, { error: "Enter a valid email address." });
  if (!ROLES.includes(role)) return reply(400, { error: "Choose an access level." });
  if (password && password.length < MIN_PASSWORD) return reply(400, { error: `The password needs at least ${MIN_PASSWORD} characters.` });

  // Confirmed straight away: an admin vouches for the address, so no confirmation email is sent.
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    ...(password ? { password } : {}),
  });
  if (error || !created.user) {
    const taken = error?.status === 422 || /already/i.test(error?.message ?? "");
    return reply(taken ? 409 : 400, { error: taken ? `${email} already has an account.` : error?.message ?? "The account wasn't created." });
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      role,
      first_name: body.first_name?.trim() || null,
      factory_id: role === "factory" ? body.factory_id || null : null,
      organization_id: role === "client" ? body.organization_id || null : null,
    })
    .eq("id", created.user.id);
  if (profileError) {
    // Don't leave a half-made account behind.
    await admin.auth.admin.deleteUser(created.user.id);
    return reply(400, { error: profileError.message });
  }

  return reply(200, { id: created.user.id, email });
});
