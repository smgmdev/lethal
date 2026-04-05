export interface Visitor {
  vid: string;
  ip: string;
  lat: number;
  lng: number;
  city: string;
  country: string;
  isp: string;
  device: string;
  browser: string;
  visitTime: number;
  lastSeen: number;
  source: "ip" | "gps";
  speed: number | null;
  accuracy: number;
}

// Global in-memory store — persists across requests within the same serverless instance
const globalStore = globalThis as unknown as { __visitors?: Map<string, Visitor> };
if (!globalStore.__visitors) {
  globalStore.__visitors = new Map<string, Visitor>();
}

const visitors = globalStore.__visitors;

export function getVisitors(): Visitor[] {
  // Clean up visitors not seen in 60 seconds
  const now = Date.now() / 1000;
  for (const [vid, v] of visitors) {
    if (now - v.lastSeen > 60) visitors.delete(vid);
  }
  return Array.from(visitors.values());
}

export function setVisitor(vid: string, data: Visitor) {
  visitors.set(vid, data);
}

export function removeVisitor(vid: string) {
  visitors.delete(vid);
}

export function getVisitor(vid: string): Visitor | undefined {
  return visitors.get(vid);
}
