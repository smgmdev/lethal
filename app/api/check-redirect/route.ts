import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Visitor polls for pending redirects
export async function GET(request: NextRequest) {
  const vid = request.nextUrl.searchParams.get("vid");
  if (!vid) return Response.json({ redirect: null });

  const { data, error } = await supabase
    .from("redirects")
    .select("*")
    .eq("vid", vid)
    .eq("executed", false)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) {
    return Response.json({ redirect: null });
  }

  // Mark as executed
  await supabase
    .from("redirects")
    .update({ executed: true })
    .eq("id", data[0].id);

  return Response.json({ redirect: data[0].url });
}
