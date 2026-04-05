import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { vid, lat, lng, accuracy, speed } = body;

  if (!vid) return Response.json({ error: "vid required" }, { status: 400 });

  // Update visitor's current position
  await supabase
    .from("visitors")
    .update({
      lat,
      lng,
      accuracy: accuracy || 0,
      speed: speed ?? null,
      source: "gps",
      last_seen: new Date().toISOString(),
    })
    .eq("vid", vid);

  // Save to history
  await supabase.from("location_history").insert({
    vid,
    lat,
    lng,
    accuracy: accuracy || 0,
    speed: speed ?? null,
    source: "gps",
  });

  return Response.json({ ok: true });
}
