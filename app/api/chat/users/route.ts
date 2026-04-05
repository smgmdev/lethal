import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const exclude = request.nextUrl.searchParams.get("exclude") || "";

  let query = supabase.from("chat_users").select("*").order("last_seen", { ascending: false });

  if (exclude) {
    query = query.neq("id", exclude);
  }

  const { data, error } = await query;
  if (error) return Response.json([]);
  return Response.json(data || []);
}
