import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Set typing status
export async function POST(request: NextRequest) {
  const { userId, conversationId } = await request.json();
  if (!userId) return Response.json({ ok: false });

  await supabase.from("typing_status").upsert({
    user_id: userId,
    conversation_id: conversationId,
    updated_at: new Date().toISOString(),
  });

  return Response.json({ ok: true });
}

// Check if other user is typing
export async function GET(request: NextRequest) {
  const conversationId = request.nextUrl.searchParams.get("conversationId") || "";
  const excludeUserId = request.nextUrl.searchParams.get("exclude") || "";

  const cutoff = new Date(Date.now() - 2000).toISOString(); // typing expires after 2s

  const { data } = await supabase
    .from("typing_status")
    .select("user_id, updated_at")
    .eq("conversation_id", conversationId)
    .neq("user_id", excludeUserId)
    .gte("updated_at", cutoff);

  return Response.json({ typing: (data && data.length > 0) });
}
