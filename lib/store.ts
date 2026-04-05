export interface LocationEntry {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  source: "ip" | "gps";
  timestamp: number; // unix seconds
}

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
  history: LocationEntry[];
}

// Global in-memory store
const globalStore = globalThis as unknown as {
  __visitors?: Map<string, Visitor>;
  __history?: LocationEntry[];
};
if (!globalStore.__visitors) globalStore.__visitors = new Map<string, Visitor>();
if (!globalStore.__history) globalStore.__history = [];

const visitors = globalStore.__visitors;
const allHistory = globalStore.__history;

export function getVisitors(): Visitor[] {
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

export function addLocationEntry(vid: string, entry: LocationEntry) {
  const visitor = visitors.get(vid);
  if (visitor) {
    visitor.history.push(entry);
  }
  // Also save to global history with vid attached
  allHistory.push({ ...entry, vid } as any);
}

export function getAllHistory(): any[] {
  return allHistory;
}

export function getVisitorHistory(vid: string): LocationEntry[] {
  const visitor = visitors.get(vid);
  return visitor?.history || [];
}
