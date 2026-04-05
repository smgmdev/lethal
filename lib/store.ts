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

// In-memory store (shared across API routes in the same process)
const visitors = new Map<string, Visitor>();

export function getVisitors(): Visitor[] {
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
