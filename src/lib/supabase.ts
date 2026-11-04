import { createClient, type PostgrestError } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../config";
import type { Database } from "./database.types";

// PKCE: a password-reset link comes back as ?code=… rather than in the # part of the address,
// which the app's #/ page links use.
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { flowType: "pkce" } });

// A database error as a thrown Error that keeps Postgres's code (e.g. "23505" for a duplicate).
export class DbError extends Error {
  code?: string;
  constructor(error: Pick<PostgrestError, "message" | "code">) {
    super(error.message);
    this.code = error.code;
  }
}

// Unwraps a Supabase result: returns its data, or throws its error.
export function unwrap<T>({ data, error }: { data: T | null; error: PostgrestError | null }): T {
  if (error) throw new DbError(error);
  return data as T;
}

export const isDuplicate = (error: unknown) => error instanceof DbError && error.code === "23505";
export const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
