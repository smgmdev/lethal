import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const { username, displayName } = await request.json();

  if (!username || !displayName) {
    return Response.json({ error: "username and displayName required" }, { status: 400 });
  }

  const id = crypto.randomUUID();

  // Check if username exists
  const { data: existing } = await supabase
    .from("chat_users")
    .select("id, username, display_name")
    .eq("username", username.toLowerCase())
    .single();

  if (existing) {
    // Login existing user
    await supabase
      .from("chat_users")
      .update({ online: true, last_seen: new Date().toISOString() })
      .eq("id", existing.id);
    return Response.json({ ok: true, user: existing });
  }

  // Register new user
  const { error } = await supabase.from("chat_users").insert({
    id,
    username: username.toLowerCase(),
    display_name: displayName,
    online: true,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, user: { id, username: username.toLowerCase(), display_name: displayName } });
}
