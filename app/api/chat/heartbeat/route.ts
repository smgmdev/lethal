import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const { userId } = await request.json();
  if (!userId) return Response.json({ ok: false });

  await supabase
    .from("chat_users")
    .update({ online: true, last_seen: new Date().toISOString() })
    .eq("id", userId);

  // Mark users as offline if not seen in 30 seconds
  const cutoff = new Date(Date.now() - 30000).toISOString();
  await supabase
    .from("chat_users")
    .update({ online: false })
    .lt("last_seen", cutoff);

  return Response.json({ ok: true });
}
