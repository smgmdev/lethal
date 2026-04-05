"use client";

import { useEffect, useRef, useState } from "react";

interface Visitor {
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

function ago(ts: number) {
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 5) return "just now";
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  return Math.floor(s / 3600) + "h ago";
}

export default function AdminPage() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<Record<string, { marker: any; color: string }>>({});
  const colorIdx = useRef(0);
  const leafletLoaded = useRef(false);

  const colors = [
    "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a855f7",
    "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#14b8a6",
  ];

  function getColor(vid: string) {
    if (markersRef.current[vid]) return markersRef.current[vid].color;
    return colors[colorIdx.current++ % colors.length];
  }

  // Load Leaflet
  useEffect(() => {
    if (leafletLoaded.current) return;
    leafletLoaded.current = true;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      const L = (window as any).L;
      mapInstance.current = L.map(mapRef.current!, { zoomControl: false }).setView([25, 45], 3);
      L.control.zoom({ position: "bottomleft" }).addTo(mapInstance.current);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; CartoDB",
      }).addTo(mapInstance.current);
    };
    document.head.appendChild(script);
  }, []);

  // Poll for visitors every 2 seconds
  useEffect(() => {
    let active = true;

    async function poll() {
      while (active) {
        try {
          const r = await fetch("/api/sessions");
          const data = await r.json();
          setVisitors(data);
        } catch {}
        await new Promise((res) => setTimeout(res, 2000));
      }
    }
    poll();

    return () => { active = false; };
  }, []);

  // Update map markers when visitors change
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapInstance.current) return;

    const active = new Set<string>();

    visitors.forEach((v) => {
      active.add(v.vid);
      if (v.lat === 0 && v.lng === 0) return;

      const color = getColor(v.vid);
      const pos: [number, number] = [v.lat, v.lng];

      if (markersRef.current[v.vid]) {
        markersRef.current[v.vid].marker.setLatLng(pos);
      } else {
        const icon = L.divIcon({
          html: `<div style="position:relative"><div style="border:2px solid ${color};border-radius:50%;width:30px;height:30px;position:absolute;top:-8px;left:-8px;animation:pulse 2s ease-out infinite"></div><div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 10px ${color}80"></div></div>`,
          className: "",
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        const marker = L.marker(pos, { icon }).addTo(mapInstance.current);
        marker.bindPopup(
          `<b>${v.vid}</b><br>${v.city}, ${v.country}<br>IP: ${v.ip}<br>${v.device} / ${v.browser}`
        );
        markersRef.current[v.vid] = { marker, color };
      }
    });

    Object.keys(markersRef.current).forEach((vid) => {
      if (!active.has(vid)) {
        mapInstance.current.removeLayer(markersRef.current[vid].marker);
        delete markersRef.current[vid];
      }
    });
  }, [visitors]);

  function flyTo(lat: number, lng: number) {
    if (mapInstance.current) mapInstance.current.setView([lat, lng], 14);
  }

  const gpsCount = visitors.filter((v) => v.source === "gps").length;
  const ipCount = visitors.filter((v) => v.source === "ip").length;

  return (
    <>
      <style>{`@keyframes pulse{0%{transform:scale(.5);opacity:.8}100%{transform:scale(2.5);opacity:0}}`}</style>

      <div ref={mapRef} style={{ width: "100vw", height: "100vh", position: "fixed", top: 0, left: 0 }} />

      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-[1000] bg-[#0a0a0aeb] backdrop-blur-xl border-b border-[#222] px-5 py-3 flex items-center justify-between">
        <h1 className="font-semibold">Live Visitors</h1>
        <div className="flex gap-5 text-sm">
          <span>Online: <span className="font-bold text-blue-500">{visitors.length}</span></span>
          <span>GPS: <span className="font-bold text-blue-500">{gpsCount}</span></span>
          <span>IP: <span className="font-bold text-blue-500">{ipCount}</span></span>
        </div>
      </div>

      {/* Sidebar */}
      <div className="fixed top-[52px] right-0 bottom-0 w-[360px] z-[1000] bg-[#0a0a0aeb] backdrop-blur-xl border-l border-[#222] overflow-y-auto">
        <h3 className="px-4 pt-4 pb-2 text-xs text-gray-600 uppercase tracking-widest">
          Active Visitors
        </h3>
        {visitors.length === 0 ? (
          <div className="p-8 text-center text-gray-600 text-sm">
            No visitors yet.<br />Share the main page URL to start tracking.
          </div>
        ) : (
          visitors.map((v) => (
            <div
              key={v.vid}
              onClick={() => flyTo(v.lat, v.lng)}
              className="mx-3 my-1 p-3 bg-[#1a1a1a] rounded-xl border border-[#222] cursor-pointer hover:border-blue-500 transition-colors"
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-sm">{v.vid}</span>
                <span
                  className={`text-[0.65rem] font-semibold px-2 py-0.5 rounded ${
                    v.source === "gps"
                      ? "bg-green-950 text-green-400"
                      : "bg-blue-950 text-blue-400"
                  }`}
                >
                  {v.source.toUpperCase()}
                </span>
              </div>
              <div className="text-sm text-gray-300">
                {v.city}
                {v.country ? `, ${v.country}` : ""}
              </div>
              <div className="text-xs text-gray-600 flex gap-2 mt-1 flex-wrap">
                <span>IP: {v.ip}</span>
                <span>{v.device} / {v.browser}</span>
                <span>{ago(v.visitTime)}</span>
                {v.speed != null && <span>{(v.speed * 3.6).toFixed(1)} km/h</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
