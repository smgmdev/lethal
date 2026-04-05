import { NextRequest } from "next/server";
import { geolocateIp, parseUserAgent } from "@/lib/geo";
import { setVisitor } from "@/lib/store";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const vid = body.vid || Math.random().toString(36).substring(2, 10);

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : request.headers.get("x-real-ip") || "127.0.0.1";
  const ua = request.headers.get("user-agent") || "";

  const geo = await geolocateIp(ip);
  const { device, browser } = parseUserAgent(ua);

  const visitor = {
    vid,
    ip,
    lat: geo.lat,
    lng: geo.lng,
    city: geo.city,
    country: geo.country,
    isp: geo.isp,
    device,
    browser,
    visitTime: Date.now() / 1000,
    lastSeen: Date.now() / 1000,
    source: "ip" as const,
    speed: null,
    accuracy: 0,
  };

  setVisitor(vid, visitor);

  return Response.json({ ok: true, vid, location: geo });
}
