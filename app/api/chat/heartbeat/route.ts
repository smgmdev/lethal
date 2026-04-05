import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const { userId } = await request.json();
  if (!userId) return Response.json({ ok: false });

  // Update online status
  await supabase
    .from("chat_users")
    .update({ online: true, last_seen: new Date().toISOString() })
    .eq("id", userId);

  // Mark all messages TO this user as delivered (they're online)
  // Get all conversations for this user
  const { data: convos } = await supabase
    .from("conversations")
    .select("id")
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

  if (convos && convos.length > 0) {
    const convoIds = convos.map((c: any) => c.id);
    await supabase
      .from("chat_messages")
      .update({ delivered: true })
      .in("conversation_id", convoIds)
      .neq("sender_id", userId)
      .eq("delivered", false);
  }

  // Mark users as offline if not seen in 30 seconds
  const cutoff = new Date(Date.now() - 30000).toISOString();
  await supabase
    .from("chat_users")
    .update({ online: false })
    .lt("last_seen", cutoff);

  return Response.json({ ok: true });
}
