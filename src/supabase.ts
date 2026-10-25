import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const projectUrl = (
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL
)?.trim();
const publicKey = (
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();

export const isSupabaseConfigured = Boolean(projectUrl && publicKey);

export const supabase = isSupabaseConfigured
  ? createClient<Database>(projectUrl!, publicKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;
