const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer } = require("ws");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev });
const handle = app.getRequestHandler();

// Shared state
const visitors = new Map();
const adminClients = new Set();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsed = parse(req.url, true);

    // Intercept /api/visit to use shared state
    if (parsed.pathname === "/api/visit" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        try {
          const data = JSON.parse(body);
          const vid = data.vid || Math.random().toString(36).substring(2, 10);
          const forwarded = req.headers["x-forwarded-for"];
          const ip = forwarded ? forwarded.split(",")[0].trim() : req.socket.remoteAddress || "127.0.0.1";
          const ua = req.headers["user-agent"] || "";

          const geo = await geolocateIp(ip);
          const { device, browser } = parseUA(ua);

          const visitor = {
            vid, ip, ...geo, device, browser,
            visitTime: Date.now() / 1000,
            lastSeen: Date.now() / 1000,
            source: "ip",
            speed: null,
            accuracy: 0,
          };
          visitors.set(vid, visitor);
          broadcast();

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, vid, location: geo }));
        } catch {
          res.writeHead(400);
          res.end("Bad request");
        }
      });
      return;
    }

    // Intercept /api/leave
    if (parsed.pathname === "/api/leave" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const { vid } = JSON.parse(body);
          if (vid) visitors.delete(vid);
          broadcast();
        } catch {}
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    // Intercept /api/sessions
    if (parsed.pathname === "/api/sessions" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(Array.from(visitors.values())));
      return;
    }

    handle(req, res, parsed);
  });

  // WebSocket server
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url, true);

    if (pathname === "/ws/admin" || pathname === "/ws/gps") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        if (pathname === "/ws/admin") {
          adminClients.add(ws);
          ws.send(JSON.stringify({ type: "visitors", data: Array.from(visitors.values()) }));
          ws.on("close", () => adminClients.delete(ws));
        }

        if (pathname === "/ws/gps") {
          ws.on("message", (raw) => {
            try {
              const data = JSON.parse(raw.toString());
              const vid = data.vid;
              if (vid && visitors.has(vid)) {
                const v = visitors.get(vid);
                v.lat = data.lat;
                v.lng = data.lng;
                v.accuracy = data.accuracy || 0;
                v.speed = data.speed;
                v.source = "gps";
                v.lastSeen = Date.now() / 1000;
                broadcast();
              }
            } catch {}
          });
        }
      });
    } else {
      socket.destroy();
    }
  });

  function broadcast() {
    const msg = JSON.stringify({ type: "visitors", data: Array.from(visitors.values()) });
    for (const ws of adminClients) {
      if (ws.readyState === 1) ws.send(msg);
    }
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`> Ready on http://0.0.0.0:${port}`);
  });
});

// ── Helpers ──

async function geolocateIp(ip) {
  // Normalize IPv6 loopback
  if (ip === "::1" || ip === "::ffff:127.0.0.1") ip = "127.0.0.1";

  const isLocal = ip === "127.0.0.1" || ip.startsWith("192.168.") || ip.startsWith("10.") || ip.startsWith("172.");
  if (isLocal) return { lat: 0, lng: 0, city: "Local Network", country: "", isp: "", ip };

  try {
    const r = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,lat,lon,isp,query`, { signal: AbortSignal.timeout(5000) });
    const data = await r.json();
    if (data.status === "success") {
      return { lat: data.lat, lng: data.lon, city: data.city || "", country: data.country || "", isp: data.isp || "", ip: data.query };
    }
  } catch {}
  return { lat: 0, lng: 0, city: "Unknown", country: "", isp: "", ip };
}

function parseUA(ua) {
  const l = ua.toLowerCase();
  let device = "Desktop";
  if (/iphone|android|mobile/.test(l)) device = "Mobile";
  else if (/ipad|tablet/.test(l)) device = "Tablet";

  let browser = "Unknown";
  if (l.includes("chrome") && !l.includes("edg")) browser = "Chrome";
  else if (l.includes("safari") && !l.includes("chrome")) browser = "Safari";
  else if (l.includes("firefox")) browser = "Firefox";
  else if (l.includes("edg")) browser = "Edge";

  return { device, browser };
}
