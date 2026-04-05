import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ytxafosekdqvxfxobbkw.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0eGFmb3Nla2RxdnhmeG9iYmt3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM1MTI3NCwiZXhwIjoyMDkwOTI3Mjc0fQ.ozruG9rZzTCf9TCSMkF6AFXxVzYmLSRAymRaSpd83n0"
);
