// Disables, enables or deletes a Factory or Client account from the app's Users page. Only admins may call it.
//
// It needs the project's secret key, which must never reach the browser, so it runs here on Supabase's servers.
//   disable  bans the account in Supabase Auth, so it can't sign in or renew its session, and marks the profile
//            disabled, which takes away its access to data straight away (private.my_factory/my_organization).
//   enable   lifts the ban and the mark.
//   delete   removes the sign-in account; its profile goes with it. Notes and order history stay, without the link.
// Admin accounts, and your own, can't be disabled or deleted here.
import { createClient } from "npm:@supabase/supabase-js@2";

const ACTIONS = ["disable", "enable", "delete"];
// Supabase bans for a length of time; this is about 100 years.
const BAN_FOREVER = "876000h";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

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
  if (callerProfile?.role !== "admin") return reply(403, { error: "Only admins can disable or delete users." });

  let body: { user_id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "The request wasn't readable." });
  }
  const action = body.action ?? "";
  const userId = body.user_id ?? "";
  if (!ACTIONS.includes(action)) return reply(400, { error: "Choose disable, enable or delete." });
  if (userId === caller.user.id) return reply(400, { error: "You can't disable or delete your own account." });

  const { data: target } = await admin.from("profiles").select("id, email, role, disabled_at").eq("id", userId).maybeSingle();
  if (!target) return reply(404, { error: "That user doesn't exist any more." });
  if (target.role !== "factory" && target.role !== "client") {
    return reply(400, { error: "Only Factory and Client accounts can be disabled or deleted. Change the access level first." });
  }

  if (action === "delete") {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return reply(400, { error: error.message });
    return reply(200, { id: userId, email: target.email, action });
  }

  const disable = action === "disable";
  const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: disable ? BAN_FOREVER : "none" });
  if (banError) return reply(400, { error: banError.message });
  const { error: profileError } = await admin
    .from("profiles")
    .update({ disabled_at: disable ? new Date().toISOString() : null })
    .eq("id", userId);
  if (profileError) {
    // Keep the ban and the mark together.
    await admin.auth.admin.updateUserById(userId, { ban_duration: disable ? "none" : BAN_FOREVER });
    return reply(400, { error: profileError.message });
  }
  return reply(200, { id: userId, email: target.email, action });
});
