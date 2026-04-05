import { NextRequest } from "next/server";
import { getVisitorHistory, getAllHistory } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const vid = request.nextUrl.searchParams.get("vid");

  if (vid) {
    return Response.json(getVisitorHistory(vid));
  }

  return Response.json(getAllHistory());
}
