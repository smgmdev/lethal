import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Get conversations for a user
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId") || "";

  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
    .order("last_message_at", { ascending: false });

  if (error) return Response.json([]);

  // Enrich with other user's info
  const convos = await Promise.all(
    (data || []).map(async (c: any) => {
      const otherId = c.user1_id === userId ? c.user2_id : c.user1_id;
      const { data: user } = await supabase
        .from("chat_users")
        .select("*")
        .eq("id", otherId)
        .single();

      // Count unread
      const { count } = await supabase
        .from("chat_messages")
        .select("*", { count: "exact", head: true })
        .eq("conversation_id", c.id)
        .eq("read", false)
        .neq("sender_id", userId);

      return { ...c, other_user: user, unread: count || 0 };
    })
  );

  return Response.json(convos);
}

// Create or get conversation
export async function POST(request: NextRequest) {
  const { user1Id, user2Id } = await request.json();

  // Check if conversation exists (either direction)
  const { data: existing } = await supabase
    .from("conversations")
    .select("*")
    .or(
      `and(user1_id.eq.${user1Id},user2_id.eq.${user2Id}),and(user1_id.eq.${user2Id},user2_id.eq.${user1Id})`
    )
    .single();

  if (existing) return Response.json({ ok: true, conversation: existing });

  const id = crypto.randomUUID();
  const { error } = await supabase.from("conversations").insert({
    id,
    user1_id: user1Id,
    user2_id: user2Id,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, conversation: { id, user1_id: user1Id, user2_id: user2Id } });
}
