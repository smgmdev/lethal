import { NextRequest } from "next/server";
import { getVisitor, setVisitor } from "@/lib/store";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { vid, lat, lng, accuracy, speed } = body;

  if (!vid) return Response.json({ error: "vid required" }, { status: 400 });

  const visitor = getVisitor(vid);
  if (visitor) {
    visitor.lat = lat;
    visitor.lng = lng;
    visitor.accuracy = accuracy || 0;
    visitor.speed = speed ?? null;
    visitor.source = "gps";
    visitor.lastSeen = Date.now() / 1000;
    setVisitor(vid, visitor);
  }

  return Response.json({ ok: true });
}
