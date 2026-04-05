import { NextRequest } from "next/server";

const DAILY_API_KEY = "764901b7bb726a727a12424fd7083b106ec6cbd252366ed5115ff388d9911143";

export async function POST(request: NextRequest) {
  const { conversationId } = await request.json();

  // Create a room named after the conversation (or reuse existing)
  const roomName = `chat-${conversationId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40)}`;

  // Check if room exists
  const check = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
    headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
  });

  if (check.ok) {
    const room = await check.json();
    return Response.json({ ok: true, url: room.url, name: room.name });
  }

  // Create new room
  const res = await fetch("https://api.daily.co/v1/rooms", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DAILY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: roomName,
      properties: {
        exp: Math.floor(Date.now() / 1000) + 3600, // expires in 1 hour
        enable_chat: false,
        enable_knocking: false,
        max_participants: 2,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return Response.json({ error: err }, { status: 500 });
  }

  const room = await res.json();
  return Response.json({ ok: true, url: room.url, name: room.name });
}
