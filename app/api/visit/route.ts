import { NextRequest } from "next/server";
import { geolocateIp, parseUserAgent } from "@/lib/geo";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const vid = body.vid || Math.random().toString(36).substring(2, 10);

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0].trim()
    : request.headers.get("x-real-ip") || "127.0.0.1";
  const ua = request.headers.get("user-agent") || "";

  const geo = await geolocateIp(ip);
  const { device, browser } = parseUserAgent(ua);

  // Upsert visitor
  await supabase.from("visitors").upsert({
    vid,
    ip,
    lat: geo.lat,
    lng: geo.lng,
    city: geo.city,
    country: geo.country,
    isp: geo.isp,
    device,
    browser,
    source: "ip",
    speed: null,
    accuracy: 0,
    visit_time: new Date().toISOString(),
    last_seen: new Date().toISOString(),
  });

  // Save IP location to history
  if (geo.lat !== 0 || geo.lng !== 0) {
    await supabase.from("location_history").insert({
      vid,
      lat: geo.lat,
      lng: geo.lng,
      accuracy: 0,
      speed: null,
      source: "ip",
    });
  }

  return Response.json({ ok: true, vid, location: geo });
}
