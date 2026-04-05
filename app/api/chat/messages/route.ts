import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Get messages for a conversation
export async function GET(request: NextRequest) {
  const conversationId = request.nextUrl.searchParams.get("conversationId") || "";
  const userId = request.nextUrl.searchParams.get("userId") || "";

  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) return Response.json([]);

  if (userId) {
    // Mark as delivered
    await supabase
      .from("chat_messages")
      .update({ delivered: true })
      .eq("conversation_id", conversationId)
      .neq("sender_id", userId)
      .eq("delivered", false);

    // Mark as read
    await supabase
      .from("chat_messages")
      .update({ read: true, delivered: true })
      .eq("conversation_id", conversationId)
      .neq("sender_id", userId)
      .eq("read", false);
  }

  return Response.json(data || []);
}

// Send a message
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { conversationId, senderId, text, fileUrl, fileType, fileName } = body;

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      text: text || null,
      file_url: fileUrl || null,
      file_type: fileType || null,
      file_name: fileName || null,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Update conversation last message
  await supabase
    .from("conversations")
    .update({
      last_message_text: text || (fileName ? `Sent ${fileType?.split("/")[0] || "file"}` : ""),
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  return Response.json({ ok: true, message: data });
}
