import { supabase } from "../lib/supabase";

export const MIN_PASSWORD = 8;

// Saves the signed-in user's new password, then tells the database they no longer have a temporary one
// (profiles.must_change_password), so the app stops asking. Used by every page where a password is changed.
export async function changeMyPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  const { error: flagError } = await supabase.rpc("password_changed");
  if (flagError) throw flagError;
}
