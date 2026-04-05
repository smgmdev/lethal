import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Send call signal — only POST, consumed via Supabase Realtime
export async function POST(request: NextRequest) {
  const { conversationId, fromId, toId, type, payload } = await request.json();

  const { error } = await supabase.from("call_signals").insert({
    conversation_id: conversationId,
    from_id: fromId,
    to_id: toId,
    type,
    payload,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
