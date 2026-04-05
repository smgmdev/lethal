import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// Admin sends a message to a visitor
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { vid, text } = body;

  if (!vid || !text) {
    return Response.json({ error: "vid and text required" }, { status: 400 });
  }

  const { error } = await supabase.from("messages").insert({
    vid,
    text,
    read: false,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
