import { createClient } from "@supabase/supabase-js";

// Client-side Supabase instance with anon key (for realtime subscriptions)
export const supabaseClient = createClient(
  "https://ytxafosekdqvxfxobbkw.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0eGFmb3Nla2RxdnhmeG9iYmt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTEyNzQsImV4cCI6MjA5MDkyNzI3NH0.zQSw0qg4U84CiyDn3vKwPDDQvsTPc-DOt04ZKziMK2M"
);
