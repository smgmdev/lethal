import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// Admin sends a redirect command to a visitor
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { vid, url } = body;

  if (!vid || !url) {
    return Response.json({ error: "vid and url required" }, { status: 400 });
  }

  const { error } = await supabase.from("redirects").insert({
    vid,
    url,
    executed: false,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
