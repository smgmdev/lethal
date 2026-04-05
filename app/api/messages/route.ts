import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Visitor polls for unread messages
export async function GET(request: NextRequest) {
  const vid = request.nextUrl.searchParams.get("vid");
  if (!vid) return Response.json([]);

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("vid", vid)
    .eq("read", false)
    .order("created_at", { ascending: true });

  if (error) return Response.json([]);

  // Mark them as read
  if (data && data.length > 0) {
    const ids = data.map((m: any) => m.id);
    await supabase.from("messages").update({ read: true }).in("id", ids);
  }

  return Response.json(data || []);
}
