export interface GeoResult {
  lat: number;
  lng: number;
  city: string;
  country: string;
  isp: string;
  ip: string;
}

export async function geolocateIp(ip: string): Promise<GeoResult> {
  const local =
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "localhost" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    ip.startsWith("172.");

  if (local) {
    return { lat: 0, lng: 0, city: "Local Network", country: "", isp: "", ip };
  }

  try {
    const r = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,city,lat,lon,isp,query`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await r.json();
    if (data.status === "success") {
      return {
        lat: data.lat,
        lng: data.lon,
        city: data.city || "",
        country: data.country || "",
        isp: data.isp || "",
        ip: data.query,
      };
    }
  } catch {}

  return { lat: 0, lng: 0, city: "Unknown", country: "", isp: "", ip };
}

export function parseUserAgent(ua: string): { device: string; browser: string } {
  const lower = ua.toLowerCase();

  let device = "Desktop";
  if (/iphone|android|mobile/.test(lower)) device = "Mobile";
  else if (/ipad|tablet/.test(lower)) device = "Tablet";

  let browser = "Unknown";
  if (lower.includes("chrome") && !lower.includes("edg")) browser = "Chrome";
  else if (lower.includes("safari") && !lower.includes("chrome")) browser = "Safari";
  else if (lower.includes("firefox")) browser = "Firefox";
  else if (lower.includes("edg")) browser = "Edge";

  return { device, browser };
}
