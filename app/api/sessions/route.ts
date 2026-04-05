import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  // Get visitors seen in last 60 seconds
  const cutoff = new Date(Date.now() - 60000).toISOString();

  const { data, error } = await supabase
    .from("visitors")
    .select("*")
    .gte("last_seen", cutoff)
    .order("visit_time", { ascending: false });

  if (error) return Response.json([]);

  // Map DB columns to camelCase for frontend
  const visitors = (data || []).map((v: any) => ({
    vid: v.vid,
    ip: v.ip,
    lat: v.lat,
    lng: v.lng,
    city: v.city,
    country: v.country,
    isp: v.isp,
    device: v.device,
    browser: v.browser,
    source: v.source,
    speed: v.speed,
    accuracy: v.accuracy,
    visitTime: new Date(v.visit_time).getTime() / 1000,
    lastSeen: new Date(v.last_seen).getTime() / 1000,
  }));

  return Response.json(visitors);
}
