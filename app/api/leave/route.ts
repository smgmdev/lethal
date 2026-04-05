import { NextRequest } from "next/server";
import { removeVisitor } from "@/lib/store";

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (body.vid) removeVisitor(body.vid);
  return Response.json({ ok: true });
}
