import { NextRequest } from "next/server";
import { getVisitor, setVisitor } from "@/lib/store";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { vid } = body;

  if (vid) {
    const visitor = getVisitor(vid);
    if (visitor) {
      visitor.lastSeen = Date.now() / 1000;
      setVisitor(vid, visitor);
    }
  }

  return Response.json({ ok: true });
}
