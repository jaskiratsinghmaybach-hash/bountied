import { createClient } from "@supabase/supabase-js";

// Used ONLY to exchange credentials for a session. The tokens are handed to
// the Rust layer immediately and nothing is persisted in the WebView.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? "",
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
);
export const supabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);
