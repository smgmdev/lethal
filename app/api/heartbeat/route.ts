import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { vid } = body;

  if (vid) {
    await supabase
      .from("visitors")
      .update({ last_seen: new Date().toISOString() })
      .eq("vid", vid);
  }

  return Response.json({ ok: true });
}
