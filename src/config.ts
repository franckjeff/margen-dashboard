// Supabase project "MARGEN PROD".
// The publishable key is safe to ship in the browser: what it can reach is
// limited by the row level security policies on each table.
// VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (e.g. in .env.local) point the app at another project.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? "https://bndicnojuvuknmmpgjgw.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY: string =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_Nzxb5QFJdBbInYOYxZeW2g_JD4tQSmn";
