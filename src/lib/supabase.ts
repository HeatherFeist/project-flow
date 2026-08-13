import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project credentials.",
  );
}

// NOTE: pass `createClient<Database>` once you've generated types with
// `supabase gen types typescript` (see README) for full query type-safety.
export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "");
