import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const vid = request.nextUrl.searchParams.get("vid");

  let query = supabase
    .from("location_history")
    .select("*")
    .order("created_at", { ascending: true });

  if (vid) {
    query = query.eq("vid", vid);
  }

  const { data, error } = await query;

  if (error) return Response.json([]);

  const history = (data || []).map((h: any) => ({
    lat: h.lat,
    lng: h.lng,
    accuracy: h.accuracy,
    speed: h.speed,
    source: h.source,
    timestamp: new Date(h.created_at).getTime() / 1000,
  }));

  return Response.json(history);
}
