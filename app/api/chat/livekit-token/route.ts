import { NextRequest } from "next/server";
import { AccessToken } from "livekit-server-sdk";

const LIVEKIT_API_KEY = "APIqNo7upNSdRku";
const LIVEKIT_API_SECRET = "jWz7MY3gKSMf9Cd6qch4IxULdTHCQ2AHC88VKpCTTqJ";

export async function POST(request: NextRequest) {
  const { roomName, identity, displayName } = await request.json();

  if (!roomName || !identity) {
    return Response.json({ error: "roomName and identity required" }, { status: 400 });
  }

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name: displayName || identity,
    ttl: "1h",
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  });

  const jwt = await Promise.resolve(token.toJwt());

  return Response.json({
    ok: true,
    token: jwt,
    url: "wss://chatai-cohvypvl.livekit.cloud",
  });
}
