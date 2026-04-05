import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Send call signal
export async function POST(request: NextRequest) {
  const { conversationId, fromId, toId, type, payload } = await request.json();

  const { error } = await supabase.from("call_signals").insert({
    conversation_id: conversationId,
    from_id: fromId,
    to_id: toId,
    type, // "offer", "answer", "ice-candidate", "call-start", "call-end", "call-reject"
    payload,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

// Get pending signals
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId") || "";

  const { data } = await supabase
    .from("call_signals")
    .select("*")
    .eq("to_id", userId)
    .order("created_at", { ascending: true });

  // Delete fetched signals
  if (data && data.length > 0) {
    await supabase
      .from("call_signals")
      .delete()
      .in("id", data.map((s: any) => s.id));
  }

  return Response.json(data || []);
}
