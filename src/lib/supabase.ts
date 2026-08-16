import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your " +
      "Supabase project credentials (and set them as build variables wherever this app is deployed).",
  );
}

// createClient throws immediately if either argument is falsy, which used to
// crash the whole app before React could render anything — a blank white
// screen with no on-page explanation. Falling back to harmless placeholder
// values keeps the app bootable so `isSupabaseConfigured` can gate a real,
// visible "set your env vars" screen instead (see main.tsx).
//
// NOTE: pass `createClient<Database>` once you've generated types with
// `supabase gen types typescript` (see README) for full query type-safety.
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
);
